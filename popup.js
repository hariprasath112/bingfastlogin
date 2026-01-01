function base32ToBuffer(base32) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    const clean = base32.replace(/\s/g, "").toUpperCase();
    for (let i = 0; i < clean.length; i++) {
        let val = alphabet.indexOf(clean[i]);
        if (val >= 0) bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2);
    }
    return bytes.buffer;
}

async function generateTOTP(secret) {
    try {
        const keyBuffer = base32ToBuffer(secret);
        const epoch = Math.floor(Date.now() / 1000);
        const time = Math.floor(epoch / 30);
        const msg = new Uint8Array(8);
        let t = time;
        for (let i = 7; i >= 0; i--) {
            msg[i] = t & 0xff;
            t >>= 8;
        }
        const cryptoKey = await crypto.subtle.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
        const hmac = await crypto.subtle.sign("HMAC", cryptoKey, msg);
        const hmacUint8 = new Uint8Array(hmac);
        const offset = hmacUint8[hmacUint8.length - 1] & 0xf;
        const otp = ((hmacUint8[offset] & 0x7f) << 24) | ((hmacUint8[offset + 1] & 0xff) << 16) | ((hmacUint8[offset + 2] & 0xff) << 8) | (hmacUint8[offset + 3] & 0xff);
        return (otp % 1000000).toString().padStart(6, '0');
    } catch (e) { return "ERROR"; }
}

const mainView = document.getElementById('mainView');
const editView = document.getElementById('editView');
const successBox = document.getElementById('successBox');
const errorBox = document.getElementById('errorBox');
const secretInput = document.getElementById('secretInput');
const fastToggle = document.getElementById('fastLoginToggle');

let activeSecret = "";
let errorInterval;

function showFailure(text) {
    clearInterval(errorInterval);
    errorBox.style.display = 'block';
    let sec = 5;
    const update = () => { errorBox.textContent = `${text} (${sec}s)`; };
    update();
    errorInterval = setInterval(() => {
        sec--;
        if (sec <= 0) {
            clearInterval(errorInterval);
            errorBox.style.display = 'none';
        } else update();
    }, 1000);
}

function showSuccess(text) {
    showView('main');
    successBox.textContent = text;
    successBox.style.display = 'block';
    setTimeout(() => { successBox.style.display = 'none'; }, 3000);
}

function showView(viewName) {
    mainView.style.display = viewName === 'main' ? 'block' : 'none';
    editView.style.display = viewName === 'edit' ? 'block' : 'none';
    if (viewName === 'edit') {
        secretInput.value = "";
        errorBox.style.display = 'none';
        clearInterval(errorInterval);
    }
}

async function refreshOTP() {
    if (!activeSecret) return;
    document.getElementById('otpDisplay').textContent = await generateTOTP(activeSecret);
    const sec = new Date().getSeconds() % 30;
    document.getElementById('progress').style.width = ((30 - sec) / 30 * 100) + "%";
}

chrome.storage.local.get(['otpSecret', 'fastLogin'], (res) => {
    fastToggle.checked = res.fastLogin !== false;
    if (res.otpSecret) {
        activeSecret = res.otpSecret;
        showView('main');
        setInterval(refreshOTP, 1000);
        refreshOTP();
    } else { showView('edit'); }
});

//update

document.addEventListener('DOMContentLoaded', () => {
    // re bind your UI elements inside the loader to ensure they exist
    const scanBtn = document.getElementById('scanBtn');
    const saveBtn = document.getElementById('saveBtn');
    const backBtn = document.getElementById('backBtn');
    const goToEditBtn = document.getElementById('goToEditBtn');
    const fastToggle = document.getElementById('fastLoginToggle');

    // safe storage initializer
    chrome.storage.local.get(['otpSecret', 'fastLogin'], (res) => {
        if (fastToggle) fastToggle.checked = res.fastLogin !== false;
        if (res.otpSecret) {
            activeSecret = res.otpSecret;
            showView('main');
            setInterval(refreshOTP, 1000);
            refreshOTP();
        } else {
            showView('edit');
        }
    });

    // Conditional Listeners
    if (fastToggle) {
        fastToggle.addEventListener('change', () => {
            chrome.storage.local.set({ fastLogin: fastToggle.checked });
        });
    }

    if (goToEditBtn) {
        goToEditBtn.addEventListener('click', () => showView('edit'));
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => { if (activeSecret) showView('main'); });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const val = secretInput.value.trim();
            if (val) {
                chrome.storage.local.set({ otpSecret: val }, () => {
                    activeSecret = val;
                    showSuccess("Saved!");
                    refreshOTP();
                });
            } else showFailure("Enter key");
        });
    }

    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: "capture" }, (response) => {
                if (!response || !response.img) return showFailure("Capture Failed");

                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code && code.data) {
                        try {
                            const url = new URL(code.data);
                            const s = url.searchParams.get("secret");
                            if (s) {
                                chrome.storage.local.set({ otpSecret: s }, () => {
                                    activeSecret = s;
                                    showSuccess("QR Scanned!");
                                    refreshOTP();
                                });
                            } else { showFailure("No secret in QR"); }
                        } catch (e) { showFailure("Invalid QR Format"); }
                    } else { showFailure("No QR visible"); }
                };
                img.src = response.img;
            });
        });
    }
});