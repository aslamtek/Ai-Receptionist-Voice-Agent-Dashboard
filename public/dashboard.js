// ============================================
// INITIALIZATION & VARIABLES
// ============================================

// Initialize Socket.IO connection
const socket = io(window.location.origin);

// Get DOM elements
const transcript = document.getElementById('transcript');
const statusBadge = document.getElementById('status');
const typingIndicator = document.getElementById('typingIndicator');

// Initialize counters
let messageCount = 0;
let conversationCount = 0;
let lastMessageDate = null;
let sessionStartTime = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Vapi Widget integration variables
let vapiInstance = null;
let isCallActive = false;

// ============================================
// 🔐 VAPI CREDENTIALS
// ============================================
const VAPI_PUBLIC_KEY = "17ed53b0-e861-42c6-a7f5-a0392ca56d46";
const VAPI_AGENT_ID = "8055f23a-436e-4933-b618-416e2bd52354";

// ============================================
// NOTIFICATION UTILITY
// ============================================
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============================================
// VAPI WIDGET INITIALIZATION
// ============================================

/**
 * Initialize Vapi Web Widget
 * This runs when window.vapiSDK becomes available
 */
function initializeVapiWidget() {
    if (!window.vapiSDK) {
        console.warn('⏳ Waiting for Vapi Widget to load...');
        setTimeout(initializeVapiWidget, 200);
        return;
    }

    console.log('🎙️ Initializing Vapi Web Widget...');

    try {
        // Run the widget with your credentials
        vapiInstance = window.vapiSDK.run({
            apiKey: VAPI_PUBLIC_KEY,
            assistant: VAPI_AGENT_ID,
            config: {
                position: "bottom-right",
                offset: "40px"
            }
        });

        console.log('✅ Vapi Widget initialized successfully!');

        // ============================================
        // VAPI EVENT LISTENERS
        // ============================================

        // Call started
        vapiInstance.on('call-start', () => {
            console.log('📞 Call started');
            isCallActive = true;
            updateCallStatus('active');
            updateVapiStatusUI('active');
            showNotification('Call started - Sarah is listening', 'success');
            showVoiceWaveOnCallStart();
        });

        // Call ended
        vapiInstance.on('call-end', () => {
            console.log('📵 Call ended');
            isCallActive = false;
            updateCallStatus('disconnected');
            updateVapiStatusUI('disconnected');
            showNotification('Call ended', 'info');
            hideVoiceWaveOnCallEnd();
        });

        // Message received (transcripts)
        vapiInstance.on('message', (message) => {
            console.log('📨 Message:', message);

            if (message.type === 'transcript' && message.transcript) {
                const speaker = message.role === 'assistant' ? 'ai' : 'user';
                addMessage(speaker, message.transcript);

                // Send to backend via Socket.IO
                if (socket && socket.connected) {
                    socket.emit('transcript', {
                        type: speaker,
                        text: message.transcript,
                        source: 'vapi'
                    });
                }
            } else if (message.type === 'function-call') {
                console.log('🔧 Function call:', message);
            }
        });

        // Volume level (for visualization)
        vapiInstance.on('volume-level', (level) => {
            updateVolumeIndicator(level);
            updateWaveformBars(level); 
        });

        // Speech started (AI speaking)
        vapiInstance.on('speech-start', () => {
            console.log('🗣️ Assistant speaking');
            updateAISpeakingIndicator(true);
        });

        // Speech ended (AI finished)
        vapiInstance.on('speech-end', () => {
            console.log('✅ Assistant finished speaking');
            updateAISpeakingIndicator(false);
        });

        // Errors
        vapiInstance.on('error', (error) => {
            console.error('❌ Vapi error:', error);
            showNotification('Call error: ' + (error.message || error), 'error');
            updateCallStatus('error');
        });

        console.log('✓ All Vapi event listeners registered');

    } catch (error) {
        console.error('❌ Error initializing Vapi Widget:', error);
        showNotification('Failed to initialize Vapi: ' + error.message, 'error');
    }
}

// ============================================
// VAPI CALL CONTROL FUNCTIONS
// ============================================

/**
 * Start a voice call
 */
function startCall() {
    console.log('📞 Starting call...');

    if (!vapiInstance) {
        console.error('❌ Vapi Widget not initialized');
        showNotification('Vapi Widget not ready - please wait', 'error');
        return;
    }

    if (isCallActive) {
        console.warn('⚠️ Call already active');
        return;
    }

    try {
        showNotification('Starting call...', 'info');
    } catch (error) {
        console.error('❌ Error starting call:', error);
        showNotification('Failed to start call: ' + error.message, 'error');
    }
}

/**
 * Stop the voice call
 */
function stopCall() {
    console.log('📵 Stopping call...');

    if (!vapiInstance) {
        console.error('❌ Vapi Widget not initialized');
        return;
    }

    if (!isCallActive) {
        console.warn('⚠️ No active call to stop');
        return;
    }

    try {

        showNotification('Call ended', 'info');
    } catch (error) {
        console.error('❌ Error stopping call:', error);
        showNotification('Error ending call: ' + error.message, 'error');
    }
}

/**
 * Show voice wave when call starts
 */
function showVoiceWaveOnCallStart() {
    console.log('✅ showVoiceWaveOnCallStart CALLED');
    const waveCard = document.getElementById('voiceWaveCard');
    const waveform = document.getElementById('voiceWaveform');
    const status = document.getElementById('voiceStatus');
    
    if (waveCard && waveform && status) {
        waveCard.classList.add('active');
        waveform.style.display = 'flex';
        status.textContent = 'Active';
    }

}

/**
 * Hide voice wave when call ends
 */
function hideVoiceWaveOnCallEnd() {
    const waveCard = document.getElementById('voiceWaveCard');   
    const waveform = document.getElementById('voiceWaveform');
    const status = document.getElementById('voiceStatus');
    
    if (waveCard && waveform && status) {
        console.log('All elements found! Setting active...');
        waveCard.classList.remove('active');
        waveform.style.display = 'none';
        status.textContent = 'Idle';
    }
}

/**

Update waveform bars based on volume level (real-time animation)
*/
function updateWaveformBars(level) {
    const bars = document.querySelectorAll('.voice-waveform .wave');
    bars.forEach((bar, i) => {
        // Create wave effect with sine function
        const height = Math.min(50, 8 + (level * 42 * Math.sin((i / bars.length) * Math.PI)));
        bar.style.height = height + 'px';
        bar.style.opacity = Math.max(0.6, 0.7 + (level * 0.3));
    });
}

/**
 * Update call status badge
 */
function updateCallStatus(status) {
    const statusBadge = document.getElementById('status');
    if (!statusBadge) return;

    const statusText = {
        'active': '☎️ Call Active',
        'connecting': '⏳ Connecting...',
        'disconnected': '✓ Connected',
        'error': '❌ Connection Error'
    };

    const statusColors = {
        'active': '#10b981',
        'connecting': '#f59e0b',
        'disconnected': '#10b981',
        'error': '#ef4444'
    };

    statusBadge.innerHTML = `<div class="status-dot"></div><span>${statusText[status] || 'Connected'}</span>`;
    statusBadge.style.background = statusColors[status] || '#10b981';
}

/**
 * Update Vapi status UI section
 */
function updateVapiStatusUI(status) {
    const vapiStatus = document.getElementById('vapiStatus');
    const aiIndicator = document.getElementById('aiIndicator');

    if (vapiStatus) {
        vapiStatus.classList.toggle('active', status === 'active');
    }

    if (aiIndicator) {
        aiIndicator.textContent = status === 'active' ? '🎤 Call Active' : '🎤 Ready to call';
        aiIndicator.classList.toggle('speaking', status === 'active');
    }
}

/**
 * Update volume indicator
 */
function updateVolumeIndicator(level) {
    const volumeBar = document.getElementById('volumeBar');
    if (volumeBar) {
        volumeBar.style.width = (level * 100) + '%';
    }
}

/**
 * Update AI speaking indicator
 */
function updateAISpeakingIndicator(isSpeaking) {
    const indicator = document.getElementById('aiIndicator');
    if (indicator) {
        indicator.classList.toggle('speaking', isSpeaking);
    }
}

/**
 * Get call statistics
 */
function getCallStats() {
    return {
        isCallActive,
        vapiReady: !!vapiInstance,
        totalMessages: messageCount,
        timestamp: new Date().toISOString()
    };
}

// ============================================
// MESSAGE MANAGEMENT FUNCTIONS
// ============================================

/**
 * Remove the empty state message when first message arrives
 */
function removeEmptyState() {
    const emptyState = transcript.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
}

/**
 * Add a message to the transcript
 */
function addMessage(type, text) {
    removeEmptyState();

    const now = new Date();
    const today = now.toLocaleDateString();

    // Add date separator if day changed
    if (lastMessageDate !== today) {
        const dateSeparator = document.createElement('div');
        dateSeparator.style.cssText = 'text-align: center; color: #9ca3af; font-size: 12px; margin: 20px 0;';
        dateSeparator.textContent = today;
        transcript.appendChild(dateSeparator);
        lastMessageDate = today;
    }

    // Create message container
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    // Create avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = type === 'user' ? '👤' : '🤖';

    // Create message content container
    const content = document.createElement('div');
    content.className = 'message-content';

    // Create label
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = type === 'user' ? 'User' : 'Sarah';

    // Create message text
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = text;

    // Create timestamp
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Assemble message structure
    content.appendChild(label);
    content.appendChild(textDiv);
    content.appendChild(time);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    // Add to transcript
    transcript.appendChild(messageDiv);

    // Auto-scroll to bottom
    transcript.scrollTop = transcript.scrollHeight;

    // Update message counter
    messageCount++;
    updateMessageCount();
}

/**
 * Update the message count display
 */
function updateMessageCount() {
    const messageCountElement = document.getElementById('messagesCount');
    if (messageCountElement) {
        messageCountElement.textContent = messageCount;
    }
}

/**
 * Update the conversation count display
 */
function updateConversationCount() {
    const conversationCountElement = document.getElementById('totalConversations');
    if (conversationCountElement) {
        conversationCountElement.textContent = conversationCount;
    }
}

// ============================================
// TYPING INDICATOR FUNCTIONS
// ============================================

function showTyping() {
    if (typingIndicator) {
        typingIndicator.classList.add('active');
        transcript.scrollTop = transcript.scrollHeight;
    }
}

function hideTyping() {
    if (typingIndicator) {
        typingIndicator.classList.remove('active');
    }
}

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

socket.on('connect', () => {
    console.log('✓ Connected to server');
    sessionStartTime = new Date();
    updateStatus('Connected', '#10b981');
    conversationCount++;
    updateConversationCount();
    reconnectAttempts = 0;
});

socket.on('disconnect', (reason) => {
    console.log('✗ Disconnected:', reason);
    updateStatus('Disconnected', '#ef4444');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    updateStatus('Connection Error', '#f59e0b');
});

socket.on('reconnect', (attemptNumber) => {
    console.log('↻ Reconnected after', attemptNumber, 'attempts');
    updateStatus('Connected', '#10b981');
});

socket.on('reconnect_failed', () => {
    console.error('Reconnection failed');
    updateStatus('Connection Failed', '#ef4444');
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});

socket.on('transcript', (data) => {
    console.log('Received transcript from server:', data);

    if (!data || !data.type || !data.text) {
        console.warn('Invalid transcript data:', data);
        return;
    }

    if (data.type === 'ai') {
        showTyping();
        setTimeout(() => {
            hideTyping();
            addMessage(data.type, data.text);
        }, 1000);
    } else {
        addMessage(data.type, data.text);
    }
});

socket.on('history', (data) => {
    console.log('Received history:', data);

    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
        removeEmptyState();
        data.data.forEach(item => {
            addMessage(item.type, item.text);
        });
    }
});

socket.on('status_update', (data) => {
    console.log('Status update:', data);
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

function updateStatus(status, color) {
    if (statusBadge) {
        statusBadge.innerHTML = `<div class="status-dot"></div><span>${status}</span>`;
        statusBadge.style.background = color;
    }
}

function clearTranscript() {
    if (confirm('Are you sure you want to clear the conversation?')) {
        transcript.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3>No conversations yet</h3>
                <p>Start a call to begin...</p>
            </div>
        `;
        messageCount = 0;
        lastMessageDate = null;
        updateMessageCount();
        console.log('Transcript cleared');
    }
}

function exportTranscript() {
    const messages = Array.from(transcript.querySelectorAll('.message'));

    if (messages.length === 0) {
        alert('No messages to export!');
        return;
    }

    const exportData = messages.map(msg => {
        const type = msg.classList.contains('user') ? 'User' : 'Sarah';
        const text = msg.querySelector('.message-text')?.textContent || '';
        const time = msg.querySelector('.message-time')?.textContent || '';
        return `[${time}] ${type}: ${text}`;
    }).join('\n');

    const blob = new Blob([exportData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-receptionist-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Transcript exported as TXT');
}

function showHelp() {
    alert(`🤖 AI Receptionist Dashboard - Help

⌨️ KEYBOARD SHORTCUTS:
• Ctrl/Cmd + Space: Toggle call on/off
• Ctrl/Cmd + K: Clear conversation
• Ctrl/Cmd + E: Export as TXT
• Ctrl/Cmd + S: Show statistics

🎙️ VOICE CALLING:
• Click "Start Call" to begin
• Speak naturally - AI listens
• Transcripts appear in real-time
• Click "End Call" to finish

✨ FEATURES:
• Real-time transcription
• Volume indicators
• Message export (TXT)
• Call statistics

💡 TIPS:
• Allow microphone permissions
• Speak clearly for better accuracy
• Check console (F12) for logs`);
}

function scrollToBottom() {
    transcript.scrollTo({
        top: transcript.scrollHeight,
        behavior: 'smooth'
    });
}

function getConversationStats() {
    const messages = Array.from(transcript.querySelectorAll('.message'));
    const userMessages = messages.filter(msg => msg.classList.contains('user'));
    const aiMessages = messages.filter(msg => msg.classList.contains('ai'));

    const stats = {
        totalMessages: messages.length,
        userMessages: userMessages.length,
        aiMessages: aiMessages.length,
        callActive: isCallActive,
        timestamp: new Date().toISOString()
    };

    console.log('Conversation Statistics:', stats);
    return stats;
}

function getSessionDuration() {
    if (!sessionStartTime) return '0m';
    const duration = new Date() - sessionStartTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Space to toggle call
    if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        isCallActive ? stopCall() : startCall();
    }
    // Ctrl/Cmd + K to clear
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        clearTranscript();
    }
    // Ctrl/Cmd + E to export
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportTranscript();
    }
    // Ctrl/Cmd + S to show stats
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const stats = getConversationStats();
        alert(`📊 STATISTICS\n\nTotal Messages: ${stats.totalMessages}\nUser Messages: ${stats.userMessages}\nAI Messages: ${stats.aiMessages}\nCall Active: ${stats.callActive ? 'Yes' : 'No'}`);
    }
});

if (transcript) {
    transcript.addEventListener('scroll', () => {
        const scrollBtn = document.getElementById('scrollBtn');
        if (scrollBtn) {
            const isScrolledUp = transcript.scrollHeight - transcript.scrollTop > transcript.clientHeight + 100;
            scrollBtn.classList.toggle('visible', isScrolledUp);
        }
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('📵 Tab hidden');
    } else {
        console.log('📱 Tab visible');
        if (transcript) {
            transcript.scrollTop = transcript.scrollHeight;
        }
    }
});

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('beforeunload', (e) => {
    if (isCallActive) {
        e.preventDefault();
        e.returnValue = 'A call is in progress. Are you sure you want to leave?';
    }
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Dashboard initializing...');
    console.log('Checking for Vapi Widget...');

    // Initialize Vapi Widget (will poll until window.vapiSDK is available)
    initializeVapiWidget();

    // Set initial conversation count
    conversationCount = 1;
    updateConversationCount();

    // Update session duration periodically
    setInterval(() => {
        const durationElement = document.querySelector('.stat-card:nth-child(3) .value');
        if (durationElement && sessionStartTime) {
            durationElement.textContent = getSessionDuration();
        }
    }, 1000);

    console.log('✅ Dashboard ready');
    console.log('Keyboard shortcuts:');
    console.log('  Ctrl/Cmd + Space: Toggle call');
    console.log('  Ctrl/Cmd + K: Clear transcript');
    console.log('  Ctrl/Cmd + E: Export transcript');
    console.log('  Ctrl/Cmd + S: Show statistics');
});

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ============================================

window.startCall = startCall;
window.stopCall = stopCall;
window.getCallStats = getCallStats;
window.clearTranscript = clearTranscript;
window.exportTranscript = exportTranscript;
window.getConversationStats = getConversationStats;
window.showHelp = showHelp;
window.scrollToBottom = scrollToBottom;

console.log('✅ Dashboard JavaScript loaded successfully');
