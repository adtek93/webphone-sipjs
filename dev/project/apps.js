/* globals SIP */

var ctxSip = null;
let hasAttemptedCall = false;

document.addEventListener('DOMContentLoaded', function() {
    // Khởi tạo SIPCreds
    if (typeof user === 'undefined') {
        user = JSON.parse(localStorage.getItem('SIPCreds')) || {
            User: 'customer-001',
            Pass: 'customer-001',
            WSServer: 'wss://ivi.io.vn:18089/ws',
            Display: '0909123123',
            Realm: 'ivi.io.vn',
            callDestination: 'sip:02873006666@ivi.io.vn'
        };
        localStorage.setItem('SIPCreds', JSON.stringify(user));
    }

    // Khởi tạo ctxSip
    ctxSip = {
        config: {
            password: user.Pass,
            displayName: user.Display,
            uri: 'sip:' + user.User + '@' + user.Realm,
            wsServers: user.WSServer,
            registerExpires: 30,
            traceSip: true,
            log: { level: 0 },
            iceServers: [
                {
                    urls: 'turn:157.10.53.58:3478?transport=udp',
                    username: 'adtek',
                    credential: 'dCloud1234@'
                }
            ],
            iceTransportPolicy: 'relay',
            media: {
                constraints: { audio: true, video: false },
                codecs: ['opus'],
                RTCConstraints: {
                    mandatory: {
                        OfferToReceiveAudio: true,
                        OfferToReceiveVideo: false
                    }
                }
            },
            register: true,
            autostart: true,
            noAnswerTimeout: 120000
        },
        ringtone: document.getElementById('ringtone'),
        ringbacktone: document.getElementById('ringbacktone'),
        dtmfTone: document.getElementById('dtmfTone'),
        audioRemote: document.getElementById('audioRemote'),
        Sessions: [],
        callTimers: {},
        callActiveID: null,
        Stream: null,
        phone: null,
        isRegistered: false,
        isReady: false,
        callTimerInterval: null
    };
    window.ctxSip = ctxSip;

    // Hàm định dạng thời gian cuộc gọi
    function formatCallTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Vô hiệu hóa âm thanh nếu không tải được
    ctxSip.startRingTone = function() { if (ctxSip.ringtone) ctxSip.ringtone.play().catch(err => console.error('Ringtone error:', err)); };
    ctxSip.stopRingTone = function() { if (ctxSip.ringtone) ctxSip.ringtone.pause(); };
    ctxSip.startRingbackTone = function() { if (ctxSip.ringbacktone) ctxSip.ringbacktone.play().catch(err => console.error('Ringbacktone error:', err)); };
    ctxSip.stopRingbackTone = function() { if (ctxSip.ringbacktone) ctxSip.ringbacktone.pause(); };
    ctxSip.getUniqueID = function() { return Math.random().toString(36).substr(2, 9); };

    ctxSip.newSession = function(newSess) {
        newSess.ctxid = ctxSip.getUniqueID();
        newSess.displayName = newSess.remoteIdentity.displayName || newSess.remoteIdentity.uri.user;
        ctxSip.Sessions[newSess.ctxid] = newSess;
        ctxSip.callActiveID = newSess.ctxid;
        if (newSess.direction === 'incoming') {
            ctxSip.startRingTone();
            document.getElementById('callStatus').innerText = `Cuộc gọi đến từ ${newSess.displayName}...`;
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.remove('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Kết thúc');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-phone-slash"></i>';
            document.getElementById('hangupButton').onclick = endCall;
        } else {
            ctxSip.startRingbackTone();
            document.getElementById('callStatus').innerText = 'Đang gọi CSKH...';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.remove('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Kết thúc');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-phone-slash"></i>';
            document.getElementById('hangupButton').onclick = endCall;
        }

        newSess.on('accepted', function() {
            ctxSip.stopRingbackTone();
            ctxSip.stopRingTone();
            ctxSip.callActiveID = newSess.ctxid;
            ctxSip.attachRemoteStream(newSess);
            document.getElementById('callStatus').innerText = 'Đang nói chuyện với CSKH';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.remove('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Kết thúc');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-phone-slash"></i>';
            document.getElementById('hangupButton').onclick = endCall;
            document.getElementById('muteButton').style.display = 'flex';
            document.getElementById('keypadButton').style.display = 'flex';
            document.getElementById('keypad').style.display = 'none';
            document.getElementById('callStatus').style.display = 'block';
            let seconds = 0;
            document.getElementById('callTimer').style.display = 'block';
            document.getElementById('callTimer').innerText = formatCallTime(seconds);
            if (ctxSip.callTimerInterval) {
                clearInterval(ctxSip.callTimerInterval);
            }
            ctxSip.callTimerInterval = setInterval(() => {
                seconds++;
                document.getElementById('callTimer').innerText = formatCallTime(seconds);
            }, 1000);
        });

        newSess.on('bye', function() {
            ctxSip.stopRingTone();
            ctxSip.stopRingbackTone();
            ctxSip.callActiveID = null;
            ctxSip.Sessions[newSess.ctxid] = null;
            document.getElementById('callStatus').innerText = 'Cuộc gọi đã kết thúc';
            document.getElementById('callStatus').style.display = 'block';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.add('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Gọi lại');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
            document.getElementById('hangupButton').onclick = recall;
            document.getElementById('muteButton').classList.remove('active');
            document.getElementById('keypadButton').classList.remove('active');
            document.getElementById('keypad').style.display = 'none';
            document.getElementById('callTimer').style.display = 'none';
            if (ctxSip.callTimerInterval) {
                clearInterval(ctxSip.callTimerInterval);
                ctxSip.callTimerInterval = null;
            }
            hasAttemptedCall = false;
            ctxSip.phone.unregister();
        });

        newSess.on('failed', function(e) {
            console.error('Call failed:', e.status_code, e.reason_phrase);
            ctxSip.stopRingTone();
            ctxSip.stopRingbackTone();
            ctxSip.callActiveID = null;
            ctxSip.Sessions[newSess.ctxid] = null;
            const busyCodes = [486, 600, 603];
            document.getElementById('callStatus').innerText = busyCodes.includes(e.status_code) ? 'Máy bận' : 'Không bắt máy';
            document.getElementById('callStatus').style.display = 'block';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.add('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Gọi lại');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
            document.getElementById('hangupButton').onclick = recall;
            document.getElementById('muteButton').classList.remove('active');
            document.getElementById('keypadButton').classList.remove('active');
            document.getElementById('keypad').style.display = 'none';
            document.getElementById('callTimer').style.display = 'none';
            if (ctxSip.callTimerInterval) {
                clearInterval(ctxSip.callTimerInterval);
                ctxSip.callTimerInterval = null;
            }
            hasAttemptedCall = false;
            ctxSip.phone.unregister();
        });

        newSess.on('terminated', function() {
            ctxSip.stopRingTone();
            ctxSip.stopRingbackTone();
            ctxSip.callActiveID = null;
            ctxSip.Sessions[newSess.ctxid] = null;
            document.getElementById('callStatus').innerText = 'Cuộc gọi đã kết thúc';
            document.getElementById('callStatus').style.display = 'block';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.add('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Gọi lại');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
            document.getElementById('hangupButton').onclick = recall;
            document.getElementById('muteButton').classList.remove('active');
            document.getElementById('keypadButton').classList.remove('active');
            document.getElementById('keypad').style.display = 'none';
            document.getElementById('callTimer').style.display = 'none';
            if (ctxSip.callTimerInterval) {
                clearInterval(ctxSip.callTimerInterval);
                ctxSip.callTimerInterval = null;
            }
            hasAttemptedCall = false;
            ctxSip.phone.unregister();
        });
    };

    ctxSip.attachRemoteStream = function (session) {
        const peerConnection = session.sessionDescriptionHandler.peerConnection;
        const remoteStream = new MediaStream();
        peerConnection.getReceivers().forEach(receiver => {
            if (receiver.track && receiver.track.kind === 'audio') {
                remoteStream.addTrack(receiver.track);
            }
        });
        if (ctxSip.audioRemote) {
            ctxSip.audioRemote.srcObject = remoteStream;
            ctxSip.audioRemote.muted = false;
            ctxSip.audioRemote.volume = 1.0;
            ctxSip.audioRemote.play().then(() => {
                document.getElementById('callStatus').innerText = 'Âm thanh đang phát';
            }).catch(err => {
                console.error('Audio play error:', err);
                document.getElementById('callStatus').innerText = `Lỗi phát âm thanh: ${err.message}. Vui lòng tải lại trang.`;
            });
        } else {
            console.error('audioRemote element not found');
            document.getElementById('callStatus').innerText = 'Lỗi: Không tìm thấy audioRemote';
        }
        peerConnection.onconnectionstatechange = () => {
            document.getElementById('callStatus').innerText = `Media ${peerConnection.connectionState}`;
            if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
                console.error('WebRTC connection failed or disconnected');
                document.getElementById('callStatus').innerText = 'Lỗi: Kết nối WebRTC thất bại';
            }
        };
        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
                console.error('ICE connection failed or disconnected');
                document.getElementById('callStatus').innerText = 'Lỗi: Kết nối ICE thất bại';
            }
        };
        peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                if (e.candidate.candidate.includes('typ relay')) {
                    // console.log('TURN candidate detected:', e.candidate.candidate);
                } else if (e.candidate.candidate.includes('typ srflx')) {
                    // console.log('STUN candidate detected:', e.candidate.candidate);
                } else if (e.candidate.candidate.includes('typ host')) {
                    // console.log('Host candidate detected:', e.candidate.candidate);
                }
            }
        };
        peerConnection.onicecandidateerror = (e) => {
            console.error('ICE candidate error:', {
                errorCode: e.errorCode,
                errorText: e.errorText,
                url: e.url
            });
            document.getElementById('callStatus').innerText = `Lỗi ICE: ${e.errorText || 'Không xác định'}`;
        };
    };

    ctxSip.getUserMediaFailure = function(e) {
        console.error('getUserMedia failed:', e.name, e.message);
        document.getElementById('callStatus').innerText = `Lỗi: Vui lòng cấp quyền microphone và thử lại (${e.message})`;
        document.getElementById('hangupButton').style.display = 'flex';
        document.getElementById('hangupButton').classList.add('recall');
        document.getElementById('hangupButton').setAttribute('title', 'Thử lại');
        document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
        document.getElementById('hangupButton').onclick = () => {
            // console.log('Requesting microphone permission again...');
            navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(ctxSip.getUserMediaSuccess)
                .catch(ctxSip.getUserMediaFailure);
        };
    };

    ctxSip.getUserMediaSuccess = function(stream) { 
        ctxSip.Stream = stream; 
        // console.log('getUserMedia success, stream tracks:', stream.getTracks());
        if (ctxSip.isRegistered && user.callDestination && !hasAttemptedCall) {
            // console.log('SIP registered, initiating call...');
            ctxSip.sipCall(user.callDestination);
            hasAttemptedCall = true;
        } else {
            // console.log('Waiting for SIP registration to initiate call...');
        }
    };

    ctxSip.sipCall = function(target) {
        // console.log('Starting sipCall with target:', target);
        if (!ctxSip.isRegistered) {
            console.error('SIP not registered yet');
            document.getElementById('callStatus').innerText = 'Lỗi: Chưa đăng ký với server';
            return;
        }
        if (!ctxSip.Stream) {
            console.error('Microphone stream not available');
            document.getElementById('callStatus').innerText = 'Lỗi: Vui lòng cấp quyền microphone và thử lại';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.add('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Thử lại');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
            document.getElementById('hangupButton').onclick = () => {
                // console.log('Requesting microphone permission again...');
                navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                    .then(ctxSip.getUserMediaSuccess)
                    .catch(ctxSip.getUserMediaFailure);
            };
            return;
        }
        if (hasAttemptedCall) {
            // console.log('Call already attempted, exiting...');
            return;
        }
        try {
            // console.log('Initiating SIP invite...');
            const session = ctxSip.phone.invite(target, {
                media: { 
                    stream: ctxSip.Stream, 
                    constraints: { audio: true, video: false }, 
                    render: { remote: document.getElementById('audioRemote') }, 
                    RTCConstraints: { 
                        mandatory: {
                            OfferToReceiveAudio: true,
                            OfferToReceiveVideo: false
                        },
                        optional: [{ 'DtlsSrtpKeyAgreement': 'true' }]
                    } 
                },
                sessionDescriptionHandlerOptions: {
                    constraints: { audio: true, video: false }
                }
            });
            session.direction = 'outgoing';
            ctxSip.newSession(session);
            hasAttemptedCall = true;
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.remove('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Kết thúc');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-phone-slash"></i>';
            document.getElementById('hangupButton').onclick = endCall;
        } catch (e) { 
            console.error('Error during call:', e);
            document.getElementById('callStatus').innerText = 'Không bắt máy';
            document.getElementById('hangupButton').style.display = 'flex';
            document.getElementById('hangupButton').classList.add('recall');
            document.getElementById('hangupButton').setAttribute('title', 'Gọi lại');
            document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
            document.getElementById('hangupButton').onclick = recall;
            hasAttemptedCall = false;
            ctxSip.phone.unregister();
        }
    };

    ctxSip.hasWebRTC = function() { 
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); 
    };

    if (!ctxSip.hasWebRTC()) {
        console.error('WebRTC not supported');
        document.getElementById('callStatus').innerText = 'Lỗi: Trình duyệt không hỗ trợ WebRTC';
        return;
    }

    if (typeof SIP === 'undefined' || !SIP.UA) {
        console.error('SIP.js not loaded or SIP.UA is not available');
        document.getElementById('callStatus').innerText = 'Lỗi: Không tải được SIP.js';
        return;
    }

    try {
        ctxSip.phone = new SIP.UA(ctxSip.config);
    } catch (e) {
        console.error('Failed to initialize SIP.UA:', e);
        document.getElementById('callStatus').innerText = 'Lỗi: Không thể khởi tạo SIP client';
        return;
    }

    ctxSip.phone.on('registered', function() { 
        ctxSip.isReady = true; 
        ctxSip.isRegistered = true;
        // console.log('SIP registered successfully');
        if (ctxSip.Stream && user.callDestination && !hasAttemptedCall) {
            // console.log('Initiating call after SIP registration...');
            ctxSip.sipCall(user.callDestination);
            hasAttemptedCall = true;
        }
    });

    ctxSip.phone.on('registrationFailed', function(e) { 
        console.error('SIP registration failed:', e); 
        document.getElementById('callStatus').innerText = 'Lỗi: Không thể kết nối với server';
    });

    ctxSip.phone.on('invite', function(incomingSession) { 
        incomingSession.direction = 'incoming'; 
        ctxSip.newSession(incomingSession); 
    });

    window.addEventListener('beforeunload', function() {
        if (ctxSip.phone) {
            ctxSip.phone.unregister();
            ctxSip.phone.stop();
        }
    });

    // Kiểm tra quyền microphone khi tải trang
    if (ctxSip.hasWebRTC()) {
        // console.log('Checking microphone permission...');
        navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {
            if (permissionStatus.state === 'granted') {
                // console.log('Microphone permission already granted');
                navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                    .then(ctxSip.getUserMediaSuccess)
                    .catch(ctxSip.getUserMediaFailure);
            } else if (permissionStatus.state === 'prompt') {
                // console.log('Requesting microphone permission...');
                document.getElementById('callStatus').innerText = 'Đang yêu cầu quyền microphone...';
                navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                    .then(ctxSip.getUserMediaSuccess)
                    .catch(ctxSip.getUserMediaFailure);
            } else {
                console.warn('Microphone permission denied');
                document.getElementById('callStatus').innerText = 'Lỗi: Quyền microphone bị từ chối, vui lòng cấp lại';
                document.getElementById('hangupButton').style.display = 'flex';
                document.getElementById('hangupButton').classList.add('recall');
                document.getElementById('hangupButton').setAttribute('title', 'Thử lại');
                document.getElementById('hangupButton').innerHTML = '<i class="fas fa-redo"></i>';
                document.getElementById('hangupButton').onclick = () => {
                    // console.log('Requesting microphone permission again...');
                    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                        .then(ctxSip.getUserMediaSuccess)
                        .catch(ctxSip.getUserMediaFailure);
                };
            }
        }).catch(err => {
            console.error('Permission query failed:', err);
            document.getElementById('callStatus').innerText = 'Lỗi: Không thể kiểm tra quyền microphone';
        });
    } else {
        console.error('WebRTC not supported');
        document.getElementById('callStatus').innerText = 'Lỗi: Trình duyệt không hỗ trợ WebRTC';
    }
});

let isMuted = false;
let isKeypadOpen = false;

function updateCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('currentTime').innerText = `${hours}:${minutes}`;
}
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

function endCall() {
    if (window.ctxSip && window.ctxSip.callActiveID && window.ctxSip.Sessions[window.ctxSip.callActiveID]) {
        window.ctxSip.Sessions[window.ctxSip.callActiveID].terminate();
        // console.log('endCall triggered: Terminating session, callActiveID=', window.ctxSip.callActiveID);
    } else {
        console.warn('endCall triggered: No active session to terminate');
    }
}

function recall() {
    // console.log('recall triggered: Initiating new call');
    hasAttemptedCall = false;
    if (window.ctxSip && window.ctxSip.isRegistered && user.callDestination) {
        ctxSip.sipCall(user.callDestination);
    } else {
        window.location.reload(true);
    }
}

function toggleMute() {
    if (window.ctxSip && window.ctxSip.callActiveID && window.ctxSip.Sessions[window.ctxSip.callActiveID]) {
        const session = window.ctxSip.Sessions[window.ctxSip.callActiveID];
        const peerConnection = session.sessionDescriptionHandler.peerConnection;
        isMuted = !isMuted;
        peerConnection.getSenders().forEach(sender => {
            if (sender.track && sender.track.kind === 'audio') {
                sender.track.enabled = !isMuted;
                // console.log(`toggleMute: Microphone ${isMuted ? 'muted' : 'unmuted'}, track enabled: ${sender.track.enabled}`);
            }
        });
        document.getElementById('muteButton').classList.toggle('active', isMuted);
        document.getElementById('muteButton').innerHTML = `<i class="fas fa-microphone${isMuted ? '-slash' : ''}"></i>`;
        document.getElementById('callStatus').innerText = isMuted ? 'Microphone tắt' : 'Microphone bật';
    } else {
        console.error('toggleMute: Cannot toggle mute, no active session');
        document.getElementById('callStatus').innerText = 'Lỗi: Không có phiên gọi hoạt động';
    }
}

function toggleKeypad() {
    isKeypadOpen = !isKeypadOpen;
    document.getElementById('keypad').style.display = isKeypadOpen ? 'grid' : 'none';
    document.getElementById('keypadButton').classList.toggle('active', isKeypadOpen);
    document.getElementById('callStatus').style.display = isKeypadOpen ? 'none' : 'block';
    document.getElementById('callTimer').style.display = isKeypadOpen ? 'none' : window.ctxSip.callActiveID ? 'block' : 'none';
    // console.log(`toggleKeypad: Keypad ${isKeypadOpen ? 'opened' : 'closed'}`);
}

function sendDTMF(digit) {
    if (window.ctxSip && window.ctxSip.callActiveID && window.ctxSip.Sessions[window.ctxSip.callActiveID]) {
        window.ctxSip.Sessions[window.ctxSip.callActiveID].sendDTMF(digit);
        const dtmfTone = document.getElementById('dtmfTone');
        dtmfTone.currentTime = 0;
        dtmfTone.play().catch(err => console.error('DTMF audio error:', err));
        // console.log(`sendDTMF: Sent DTMF digit: ${digit}`);
    } else {
        console.warn('sendDTMF: No active session to send DTMF');
    }
}

// Bỏ đăng ký Service Worker để tránh lỗi 403
// if ('serviceWorker' in navigator) {
//     window.addEventListener('load', () => {
//         navigator.serviceWorker.register('/sw.js').then((registration) => {
//             // console.log('Service Worker registered:', registration.scope);
//         }).catch((error) => {
//             console.error('Service Worker registration failed:', error);
//         });
//     });
// }

window.addEventListener('load', () => {
    const callContainer = document.getElementById('callContainer');
    const computedStyle = window.getComputedStyle(callContainer);
    // console.log('callContainer padding-bottom:', computedStyle.paddingBottom);
    // console.log('callControls position:', document.getElementById('callControls').getBoundingClientRect());
});
