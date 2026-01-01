chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "capture") {
        // Captures the currently visible area of the active tab
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            sendResponse({ img: dataUrl });
        });
        return true; // Keeps the communication channel open for async response
    }
});