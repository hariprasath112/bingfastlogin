// totp generation function
async function generateTOTP(secret) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    const clean = secret.replace(/\s/g, "").toUpperCase();
    for (let i = 0; i < clean.length; i++) {
        let val = alphabet.indexOf(clean[i]);
        if (val >= 0) bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2);
    }
    const keyBuffer = bytes.buffer;
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
}

// find element
function findElement(xpath) {
    try {
        return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch (e) { return null; }
}

// page 1
function createFastLoginButton(originalBtn) {
    if (document.getElementById('fast-login-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'fast-login-btn';
    btn.className = originalBtn.className;
    btn.type = 'button';

    //get the internal path of your logo
    const imgUrl = chrome.runtime.getURL('img.png');

    // HTML
    const buttonInnerHtml = (text) => `
        <div style="display: flex; align-items: center; justify-content: center;">
            <img src="${imgUrl}" style="width: 20px; height: 20px; margin-right: 8px; border-radius: 2px; opacity: 0.7;" />
            <span class="mdc-button__label">${text}</span>
        </div>
    `;

    btn.innerHTML = buttonInnerHtml('FAST LOGIN');

    btn.style.marginLeft = '10px';
    btn.style.backgroundColor = '#005A43';
    btn.style.transition = 'all 0.2s ease';
    btn.style.padding = '0 12px';

    btn.onclick = (e) => {
        e.preventDefault();

        // immedetiate feedback
        btn.innerHTML = buttonInnerHtml('LOGGING IN...');
        btn.style.opacity = '0.6';
        btn.style.cursor = 'wait';

        setTimeout(() => {
            const userField = document.getElementById('username');
            const passField = document.getElementById('password');

            if (userField && passField) {
                const evts = ['input', 'change', 'blur'];
                [userField, passField].forEach(el => {
                    evts.forEach(type => el.dispatchEvent(new Event(type, { bubbles: true })));
                });
                originalBtn.click();
            }
        }, 5);
    };

    originalBtn.insertAdjacentElement('afterend', btn);
}

// mail loop
async function runAutomation() {
    const settings = await chrome.storage.local.get(['otpSecret', 'fastLogin']);
    if (settings.fastLogin === false) return;

    // Detect page 1 Elements
    const userField = document.getElementById('username');
    const loginBtn1 = document.querySelector('button[name="submit"]') || document.querySelector('button[type="submit"]');

    // Detect page 2 Elements
    const otpField = document.getElementById('token');

    // page 1: Inject Button
    if (userField && loginBtn1) {
        createFastLoginButton(loginBtn1);
    }
    // page 2: Auto-Fill
    else if (otpField && settings.otpSecret) {
        if (!otpField.value || otpField.value.length < 6) {
            const code = await generateTOTP(settings.otpSecret);
            otpField.value = code;

            ['input', 'change', 'blur'].forEach(type =>
                otpField.dispatchEvent(new Event(type, { bubbles: true }))
            );

            const loginBtn2 = document.querySelector('button[accesskey="s"]') || document.querySelector('.btn-submit');
            if (loginBtn2) setTimeout(() => loginBtn2.click(), 50);
        }
    }
}

// Check every 500ms
setInterval(runAutomation, 50);