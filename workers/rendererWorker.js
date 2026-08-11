// rendererWorker.js
// ====================== Imports ======================
importScripts(
    //'console-redirect-worker.js',
    'https://static.sumeruai.com/new-avatars/numjs.min.js',
    'https://static.sumeruai.com/new-avatars/load_data.js',
    'https://static.sumeruai.com/new-avatars/upng.js',
    'https://static.sumeruai.com/new-avatars/renderer_webgl0.js',
    'https://static.sumeruai.com/new-avatars/renderer_webglW.js',
    'https://static.sumeruai.com/new-avatars/renderer.js',
);
// ====================== Environment for Renderer Worker ======================
const env = {
    log: (msg) => console.log('[RendererWorker]', msg),
    setStatus: (type, msg) => console.log(`[RendererWorker][STATUS][${type}] ${msg}`),
    setStatusDemuxer: (type, msg) => {
        // Typically not used by the renderer
    },
    eventMessage: (msg_type, workerName) => {
        console.log(`[RendererWorker] Event message: ${msg_type}, worker: ${workerName}`);
        self.postMessage({ type: msg_type, name: workerName });
    },
    logMessage: (message, level, workerName) => {
        const msg_type = 'console';
        //console.log(`[RendererWorker] Event message: ${msg_type}, worker: ${workerName}`, message, `Level: ${level}`);
        self.postMessage({ type: msg_type, name: workerName, message:message, level:level  });
    },
    requestAnimationFrame: (cb) => {
        if (typeof self.requestAnimationFrame === 'function') {
            self.requestAnimationFrame(cb);
        } else {
            // Fallback if not available in the worker
            setTimeout(() => cb(performance.now()), 1);
        }
    },
};

// ====================== Instantiate the Renderer ======================
/**
 * If your renderer needs access to a Decoder instance or caches, 
 * pass it in here. Otherwise, you can pass null or skip it.
 */
const renderer = new Renderer(env, /* decoderInstanceIfNeeded */ null);

// ====================== Worker Message Handler ======================
self.addEventListener('message', async (event) => {
    //console.warn('rendererWorker.js: event.data', event.data.type);
    const data = event.data;
    switch (data.type) {
        case 'init':
            // Typically includes: data.name, data.canvas, data.video, etc.
            renderer.handleInit(data.mainThread, data.name, data.canvas, data.sbsCanvas);
            break;
        case 'loadModel':
            // Trigger loading model/video for decoding
            await renderer.handleLoadModel(data);
            break;

        case 'close':
            renderer.handleClose();
            break;

        case 'reset':
            renderer.handleReset();
            break;

        case 'seek':
            renderer.seek(data.percent);
            break;
            
        case 'setPlaybackRate':
            renderer.setPlaybackRate(data.rate);
            break;

        case 'startPlay':
            renderer.startPlay(data.fps, data.currentTime, data.startPosition);
            break;

        case 'stopPlay':
            renderer.stopPlay();
            break;
        
        case 'enableCameraMotion':
            renderer.enableCameraMotion(data.enable);
            break;
            
        case 'renderByFrameNumber':
            renderer.renderByFrameNumber(data.frameNumber, data.frameNumber2, data.ip_alpha);
            break;

        case 'renderByCardID':
            renderer.renderByCardID(data.tid, data.bid, data.pid);
            break;

        case 'renderDefaultCard':
            renderer.renderDefaultCard();
            break;

        case 'drawDefaultImage':
            await renderer.drawDefaultImage(data.url);
            break;

        case 'prepareAnimation':
            await renderer.prepareAnimation(data);
            break;

        case 'setAnimation':
            await renderer.setAnimation(data);
            break;

        // Handling frames passed from the decoder or main thread
        case 'bgFrame':
            renderer.handleBgFrame(data.frame);
            break;

        case 'frame':
            renderer.handleFrame(data.frame, data.name);
            break;

        case 'frameData':
            renderer.handleFrameData(data.frameData, data.name);
            break;

        case 'videoLoaded':
            renderer.handleVideoLoaded();
            break;

        case 'workerAllReady':
            renderer.handleWorkerAllReady();
            break;

        default:
            console.error(`Unknown message type in rendererWorker: ${data.type}`);
            env.log(`Unknown message type in rendererWorker: ${data.type}`);
    }
});
