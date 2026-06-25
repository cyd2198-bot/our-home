/**
 * app.js
 * 가족 격리용 연결 코드(Room Code) 처리, 인트로 모달 제어, 
 * 레드로 냉장고 비주얼 동기화, 실시간 테마 셀렉터 바인딩,
 * 날짜 지정이 없는 '단순 기록 자석' 지원 로직을 담당합니다.
 */

// --- 글로벌 상태 관리 ---
const state = {
    roomCode: '', // 우리 가족 연결 코드
    magnets: [],  // 부착된 자석 배열
    fridgeTitle: '우리집 아지트', // 냉장고 타이틀명
    activeUser: {
        nickname: '',
        color: 'sky-blue',
        role: 'child'
    },
    parentLastUpdateTime: Date.now() - 47 * 60 * 60 * 1000, 
    timeSpeedMultiplier: 1, 
    isFirebaseConnected: false,
    db: null,
    storageKey: '' 
};

const COLOR_MAP = {
    'sky-blue': 'var(--color-sky-blue)',
    'sage-green': 'var(--color-sage-green)',
    'lavender-purple': 'var(--color-lavender-purple)',
    'warm-orange': 'var(--color-warm-orange)',
    'rose-pink': 'var(--color-rose-pink)'
};

let syncChannel = null;

// DOM 엘리먼트 캐싱
const introModal = document.getElementById('intro-modal');
const introRoleChild = document.getElementById('intro-role-child');
const introRoleParent = document.getElementById('intro-role-parent');
const introNicknameInput = document.getElementById('intro-nickname');
const btnMethodCreate = document.getElementById('btn-method-create');
const btnMethodJoin = document.getElementById('btn-method-join');
const joinCodeWrapper = document.getElementById('join-code-wrapper');
const joinRoomCodeInput = document.getElementById('join-room-code');
const btnStartApp = document.getElementById('btn-start-app');

const bookmarkTabs = document.querySelectorAll('.bookmark-tab');
const pagePanes = document.querySelectorAll('.page-panel');

const magnetCanvas = document.getElementById('magnet-canvas');
const fridgeBoard = document.getElementById('fridge-board');
const scheduleForm = document.getElementById('schedule-form');
const userNicknameInput = document.getElementById('user-nickname');
const userColorSelect = document.getElementById('user-color');
const selectedColorDot = document.getElementById('selected-color-dot');
const activeUserDisplay = document.getElementById('active-user-display');
const roomCodeValue = document.getElementById('room-code-value');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnChangeRoom = document.getElementById('btn-change-room');

const widgetItemsContainer = document.getElementById('widget-items-container');
const widgetUpdateTime = document.getElementById('widget-update-time');
const idleTimerDisplay = document.getElementById('idle-timer-display');
const speedSlider = document.getElementById('idle-speed-slider');
const speedLabel = document.getElementById('speed-label');
const pushNotificationBanner = document.getElementById('push-notification-banner');
const notificationMessage = document.getElementById('notification-message');
const closeNotificationBtn = document.getElementById('close-notification-btn');

// 역할 버튼들
const btnRoleChild = document.getElementById('btn-role-child');
const btnRoleParent = document.getElementById('btn-role-parent');

// 데모 버튼들
const btnTriggerMidnight = document.getElementById('btn-trigger-midnight');
const btnSimulateIdle = document.getElementById('btn-simulate-idle');
const btnClearAll = document.getElementById('btn-clear-all');

// Firebase UI 토글 관련
const firebaseCard = document.getElementById('firebase-card');
const firebaseCardHeader = document.getElementById('firebase-card-header');
const firebaseCardBody = document.getElementById('firebase-card-body');
const btnSaveFirebase = document.getElementById('btn-save-firebase');
const fbConfigJson = document.getElementById('fb-config-json');

// 모달 엘리먼트
const settingsModal = document.getElementById('settings-modal');
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');

const addMagnetModal = document.getElementById('add-magnet-modal');
const btnOpenDrawerPlus = document.getElementById('btn-open-drawer-plus');
const btnCloseAddMagnet = document.getElementById('btn-close-add-magnet');

const btnShareRoom = document.getElementById('btn-share-room');
const btnOpenClear = document.getElementById('btn-open-clear');

const fridgeTitleDisplay = document.getElementById('fridge-title-display');
const fridgeTitleInput = document.getElementById('fridge-title-input');

let activeIntroRole = 'child';
let activeCodeMethod = 'create';

// --- 앱 최초 기동 ---
window.addEventListener('DOMContentLoaded', () => {
    const cachedRoomCode = localStorage.getItem('last_active_fridge_room');
    const cachedNickname = localStorage.getItem('last_active_fridge_nickname');
    const cachedRole = localStorage.getItem('last_active_fridge_role') || 'child';

    if (cachedRoomCode && cachedNickname) {
        state.roomCode = cachedRoomCode;
        state.activeUser.nickname = cachedNickname;
        state.activeUser.role = cachedRole;
        state.activeUser.color = cachedRole === 'child' ? 'sky-blue' : 'rose-pink';

        introModal.classList.add('hidden');
        initFridgeSpace();
    } else {
        setupIntroModal();
    }

    bindCommonEvents();
});

// --- 인트로 모달 제어 ---
function setupIntroModal() {
    introRoleChild.addEventListener('click', () => {
        activeIntroRole = 'child';
        introRoleChild.classList.add('active');
        introRoleParent.classList.remove('active');
        introNicknameInput.placeholder = '예: 첫째, 막내, 아들, 딸';
    });

    introRoleParent.addEventListener('click', () => {
        activeIntroRole = 'parent';
        introRoleParent.classList.add('active');
        introRoleChild.classList.remove('active');
        introNicknameInput.placeholder = '예: 엄마, 아빠, 할머니';
    });

    btnMethodCreate.addEventListener('click', () => {
        activeCodeMethod = 'create';
        btnMethodCreate.classList.add('active');
        btnMethodJoin.classList.remove('active');
        joinCodeWrapper.classList.add('hidden');
    });

    btnMethodJoin.addEventListener('click', () => {
        activeCodeMethod = 'join';
        btnMethodJoin.classList.add('active');
        btnMethodCreate.classList.remove('active');
        joinCodeWrapper.classList.remove('hidden');
        joinRoomCodeInput.focus();
    });

    btnStartApp.addEventListener('click', () => {
        const nickname = introNicknameInput.value.trim();
        if (!nickname) {
            alert('가족들이 부를 내 호칭을 적어주세요!');
            introNicknameInput.focus();
            return;
        }

        if (activeCodeMethod === 'create') {
            state.roomCode = generateRoomCode();
        } else {
            const enteredCode = joinRoomCodeInput.value.trim().toUpperCase();
            if (!enteredCode || enteredCode.length < 4) {
                alert('가족에게 받은 올바른 코드를 입력해 주세요.');
                joinRoomCodeInput.focus();
                return;
            }
            state.roomCode = enteredCode;
        }

        state.activeUser.nickname = nickname;
        state.activeUser.role = activeIntroRole;
        state.activeUser.color = activeIntroRole === 'child' ? 'sky-blue' : 'rose-pink';

        localStorage.setItem('last_active_fridge_room', state.roomCode);
        localStorage.setItem('last_active_fridge_nickname', state.activeUser.nickname);
        localStorage.setItem('last_active_fridge_role', state.activeUser.role);

        introModal.classList.add('hidden');
        initFridgeSpace();
    });
}

function generateRoomCode() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `ROOM-${num}`;
}

// --- 격리된 냉장고 공간 초기화 ---
function initFridgeSpace() {
    state.storageKey = `virtual_fridge_magnets_${state.roomCode}`;

    if (syncChannel) syncChannel.close();
    syncChannel = new BroadcastChannel(`virtual-fridge-sync-${state.roomCode}`);
    
    syncChannel.onmessage = (event) => {
        const { type, data } = event.data;
        if (type === 'MAGNETS_UPDATE') {
            state.magnets = data.magnets;
            calculateParentLastUpdateTime();
            renderFridge();
            renderWidget();
        } else if (type === 'FRIDGE_TITLE_UPDATE') {
            state.fridgeTitle = data.title;
            if (fridgeTitleDisplay) fridgeTitleDisplay.textContent = state.fridgeTitle;
            if (fridgeTitleInput) fridgeTitleInput.value = state.fridgeTitle;
        }
    };

    roomCodeValue.textContent = state.roomCode;
    userNicknameInput.value = state.activeUser.nickname;
    userColorSelect.value = state.activeUser.color;
    selectedColorDot.style.backgroundColor = COLOR_MAP[state.activeUser.color];
    
    if (state.activeUser.role === 'child') {
        btnRoleChild.classList.add('active');
        btnRoleParent.classList.remove('active');
    } else {
        btnRoleChild.classList.remove('active');
        btnRoleParent.classList.add('active');
    }

    const saved = localStorage.getItem(state.storageKey);
    if (saved) {
        state.magnets = JSON.parse(saved);
    } else {
        state.magnets = []; // 웰컴 자석 없이 아늑하게 비어있는 상태로 시작
        saveState();
    }

    const savedTitle = localStorage.getItem(`virtual_fridge_title_${state.roomCode}`) || '우리집 아지트';
    state.fridgeTitle = savedTitle;
    if (fridgeTitleDisplay) fridgeTitleDisplay.textContent = state.fridgeTitle;
    if (fridgeTitleInput) fridgeTitleInput.value = state.fridgeTitle;

    calculateParentLastUpdateTime();
    renderFridge();
    renderWidget();
    updateActiveUserUI();
    
    startIdleMonitoring();
}

// --- 공통 이벤트 바인딩 ---
function bindCommonEvents() {
    // 탭 스위칭 (모달 내부)
    bookmarkTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('active')) return;
            
            window.fridgeSounds.playDetach();

            bookmarkTabs.forEach(t => t.classList.remove('active'));
            pagePanes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // 설정 모달 토글
    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
            window.fridgeSounds.playOpen();
        });
    }
    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            window.fridgeSounds.playClose();
        });
    }
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
            window.fridgeSounds.playClose();
        }
    });

    // 자석 서랍 추가 모달 토글
    if (btnOpenDrawerPlus) {
        btnOpenDrawerPlus.addEventListener('click', () => {
            addMagnetModal.classList.remove('hidden');
            window.fridgeSounds.playOpen();
        });
    }
    if (btnCloseAddMagnet) {
        btnCloseAddMagnet.addEventListener('click', () => {
            addMagnetModal.classList.add('hidden');
            window.fridgeSounds.playClose();
        });
    }
    addMagnetModal.addEventListener('click', (e) => {
        if (e.target === addMagnetModal) {
            addMagnetModal.classList.add('hidden');
            window.fridgeSounds.playClose();
        }
    });

    // 퀵 자석 부착 리스너
    document.querySelectorAll('.quick-magnet').forEach(item => {
        item.addEventListener('click', () => {
            const emoji = item.getAttribute('data-emoji');
            const label = item.getAttribute('data-label');
            createEmojiMagnet(emoji, label);
            
            // 퀵 자석 클릭시 바운스 애니메이션
            item.classList.add('just-snapped');
            setTimeout(() => item.classList.remove('just-snapped'), 580);
        });
    });

    // 냉장고 이름 타이틀 입력 변경 리스너
    if (fridgeTitleInput) {
        fridgeTitleInput.addEventListener('input', (e) => {
            const newTitle = e.target.value.trim() || '우리집 아지트';
            state.fridgeTitle = newTitle;
            if (fridgeTitleDisplay) fridgeTitleDisplay.textContent = newTitle;

            localStorage.setItem(`virtual_fridge_title_${state.roomCode}`, newTitle);

            if (syncChannel) {
                syncChannel.postMessage({
                    type: 'FRIDGE_TITLE_UPDATE',
                    data: { title: newTitle }
                });
            }

            if (state.isFirebaseConnected && state.db) {
                state.db.ref(`rooms/${state.roomCode}/title`).set(newTitle)
                    .catch(err => console.error("Firebase title sync error: ", err));
            }
        });
    }

    // 상단 공유 및 초기화 버튼 바인딩
    if (btnShareRoom) {
        btnShareRoom.addEventListener('click', () => {
            navigator.clipboard.writeText(state.roomCode)
                .then(() => alert('가족 연결 코드가 복사되었습니다! 가족 메신저에 공유해 보세요. (코드: ' + state.roomCode + ')'))
                .catch(() => alert('코드 복사에 실패했습니다: ' + state.roomCode));
        });
    }
    if (btnOpenClear) {
        btnOpenClear.addEventListener('click', clearAllMagnets);
    }

    // 오늘 내 기분 기성 자석 클릭 바인딩
    document.querySelectorAll('#mood-sticker-grid .sticker-item').forEach(item => {
        item.addEventListener('click', () => {
            const emoji = item.getAttribute('data-emoji');
            const label = item.getAttribute('data-label');
            createEmojiMagnet(emoji, label);
        });
    });

    // 오늘의 일상 스티커 조합 폼 및 프리뷰 제어 로직
    const emojiStickerForm = document.getElementById('emoji-sticker-form');
    const stickerEmojiInput = document.getElementById('sticker-emoji-input');
    const stickerPreviewText = document.getElementById('sticker-preview-text');
    const stickerTextBtns = document.querySelectorAll('#sticker-text-picker .combo-text-btn');

    // 입력 텍스트에서 단 하나의 이모지만 정교하게 추출하는 헬퍼 함수
    function getSelectedEmoji(inputVal) {
        if (!inputVal) return '';
        // surrogate pair 및 ZWJ 이모지 처리할 수 있도록 배열 변환
        const chars = Array.from(inputVal);
        // 뒤에서부터 보며 이모지(Pictographic)나 특수 기호가 있는지 검색
        for (let i = chars.length - 1; i >= 0; i--) {
            const char = chars[i];
            if (/\p{Extended_Pictographic}/u.test(char) || /\p{Emoji_Presentation}/u.test(char)) {
                return char;
            }
        }
        // 이모지가 아닌 텍스트가 들어온 경우 마지막 글자를 반환
        return chars[chars.length - 1] || '';
    }

    function updateStickerPreview() {
        if (stickerEmojiInput && stickerPreviewText) {
            const rawVal = stickerEmojiInput.value;
            const emoji = getSelectedEmoji(rawVal) || '☀️';
            
            // 입력 슬롯에는 추출된 1개의 이모지만 표시되도록 갱신 (입력 제한)
            stickerEmojiInput.value = emoji;

            const activeTextBtn = document.querySelector('#sticker-text-picker .combo-text-btn.active');
            const suffix = activeTextBtn ? activeTextBtn.getAttribute('data-val') : '중 🏃';
            stickerPreviewText.value = `${emoji} ${suffix}`;
        }
    }

    if (stickerEmojiInput) {
        // 이모지 입력 슬롯에 입력 시 실시간 프리뷰 갱신 및 이모지 추출 제한
        stickerEmojiInput.addEventListener('input', updateStickerPreview);
        
        // 포커스 시 터치 편의를 위해 텍스트 전체 선택
        stickerEmojiInput.addEventListener('focus', () => {
            stickerEmojiInput.select();
        });
    }

    stickerTextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            stickerTextBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.fridgeSounds.playDetach();
            updateStickerPreview();
        });
    });

    // 추가 모달 오픈 시 강제 프리뷰 갱신
    if (btnOpenDrawerPlus) {
        btnOpenDrawerPlus.addEventListener('click', () => {
            updateStickerPreview();
        });
    }

    // 초기 상태 갱신
    updateStickerPreview();

    // 오늘의 일상 스티커 조합 폼 제출
    if (emojiStickerForm) {
        emojiStickerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emoji = getSelectedEmoji(stickerEmojiInput.value) || '☀️';
            const activeTextBtn = document.querySelector('#sticker-text-picker .combo-text-btn.active');
            const suffix = activeTextBtn ? activeTextBtn.getAttribute('data-val') : '중 🏃';

            createEmojiMagnet(emoji, suffix);

            // 폼 초기 상태로 복구
            stickerEmojiInput.value = '☀️';
            stickerTextBtns.forEach((b, idx) => {
                if (idx === 0) b.classList.add('active');
                else b.classList.remove('active');
            });
            updateStickerPreview();
        });
    }

    // 강력 집게 자석 (일정 등록 제출) - 콤보 제어 없이 단독 폼으로 분리 완료
    if (scheduleForm) {
        scheduleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const dateVal = document.getElementById('schedule-date').value; 
            const textVal = document.getElementById('schedule-text').value;

            createScheduleMagnet(dateVal, textVal);
            scheduleForm.reset();
        });
    }

    // 프로필 정보 갱신
    userNicknameInput.addEventListener('input', (e) => {
        state.activeUser.nickname = e.target.value.trim() || (state.activeUser.role === 'child' ? '자녀' : '부모님');
        localStorage.setItem('last_active_fridge_nickname', state.activeUser.nickname);
        updateActiveUserUI();
    });

    userColorSelect.addEventListener('change', (e) => {
        const newColor = e.target.value;
        state.activeUser.color = newColor;
        selectedColorDot.style.backgroundColor = COLOR_MAP[newColor];
        updateActiveUserUI();
    });

    // 역할 스위칭
    btnRoleChild.addEventListener('click', () => switchRole('child'));
    btnRoleParent.addEventListener('click', () => switchRole('parent'));

    // 연결방 이탈 및 변경
    btnChangeRoom.addEventListener('click', () => {
        if (confirm('가족 연결을 해제하고 다른 공간으로 이동할까요?')) {
            localStorage.removeItem('last_active_fridge_room');
            localStorage.removeItem('last_active_fridge_nickname');
            localStorage.removeItem('last_active_fridge_role');
            location.reload();
        }
    });

    // 코드 복사
    btnCopyCode.addEventListener('click', () => {
        navigator.clipboard.writeText(state.roomCode)
            .then(() => alert('가족 연결 코드가 복사되었습니다! 가족 메신저에 공유해 보세요.'));
    });

    btnTriggerMidnight.addEventListener('click', triggerMidnightCleanup);
    btnSimulateIdle.addEventListener('click', forceIdleTrigger);
    btnClearAll.addEventListener('click', clearAllMagnets);

    closeNotificationBtn.addEventListener('click', hidePushNotification);

    speedSlider.addEventListener('input', (e) => {
        state.timeSpeedMultiplier = parseInt(e.target.value);
        speedLabel.textContent = state.timeSpeedMultiplier === 1 ? '실시간 (1x)' : `${state.timeSpeedMultiplier}x 배속`;
    });

    firebaseCardHeader.addEventListener('click', () => {
        firebaseCard.classList.toggle('card-expanded');
        firebaseCardBody.classList.toggle('hidden');
    });

    btnSaveFirebase.addEventListener('click', connectFirebase);
}

function switchRole(role) {
    state.activeUser.role = role;
    if (role === 'child') {
        btnRoleChild.classList.add('active');
        btnRoleParent.classList.remove('active');
        state.activeUser.nickname = '자녀';
        state.activeUser.color = 'sky-blue';
    } else {
        btnRoleChild.classList.remove('active');
        btnRoleParent.classList.add('active');
        state.activeUser.nickname = '엄마';
        state.activeUser.color = 'rose-pink';
    }

    userNicknameInput.value = state.activeUser.nickname;
    userColorSelect.value = state.activeUser.color;
    selectedColorDot.style.backgroundColor = COLOR_MAP[state.activeUser.color];

    localStorage.setItem('last_active_fridge_nickname', state.activeUser.nickname);
    localStorage.setItem('last_active_fridge_role', state.activeUser.role);

    updateActiveUserUI();
    hidePushNotification(); 
}

function updateActiveUserUI() {
    const roleKor = state.activeUser.role === 'child' ? '자녀' : '부모님';
    activeUserDisplay.textContent = `접속 중: ${roleKor} (${state.activeUser.nickname})`;
}

// --- 자석 생성 ---
function createEmojiMagnet(emoji, label) {
    const margin = 20;
    const x = Math.floor(Math.random() * (100 - 2 * margin)) + margin;
    const y = Math.floor(Math.random() * (100 - 2 * margin)) + margin;

    const newMagnet = {
        id: 'mag-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        type: 'emoji',
        emoji: emoji,
        label: label,
        x: x,
        y: y,
        owner: state.activeUser.nickname,
        color: state.activeUser.color,
        role: state.activeUser.role,
        timestamp: Date.now()
    };

    state.magnets.push(newMagnet);
    saveState();
    
    window.fridgeSounds.playSnap();
    
    if (state.activeUser.role === 'parent') {
        state.parentLastUpdateTime = Date.now();
        hidePushNotification();
    }

    renderFridge();
    renderWidget();

    // 모달 닫기
    if (addMagnetModal) {
        addMagnetModal.classList.add('hidden');
    }
}

function createScheduleMagnet(dateStr, text) {
    const margin = 20;
    const x = Math.floor(Math.random() * (100 - 2 * margin)) + margin;
    const y = Math.floor(Math.random() * (100 - 2 * margin)) + margin;

    const newMagnet = {
        id: 'mag-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        type: 'schedule',
        date: dateStr || '', 
        text: text,
        x: x,
        y: y,
        owner: state.activeUser.nickname,
        color: state.activeUser.color,
        role: state.activeUser.role,
        timestamp: Date.now()
    };

    state.magnets.push(newMagnet);
    saveState();

    window.fridgeSounds.playSnap();

    if (state.activeUser.role === 'parent') {
        state.parentLastUpdateTime = Date.now();
        hidePushNotification();
    }

    renderFridge();
    renderWidget();

    // 모달 닫기
    if (addMagnetModal) {
        addMagnetModal.classList.add('hidden');
    }
}

function calculateParentLastUpdateTime() {
    const parentMagnets = state.magnets.filter(m => m.role === 'parent');
    if (parentMagnets.length > 0) {
        state.parentLastUpdateTime = Math.max(...parentMagnets.map(m => m.timestamp));
    }
}

// --- 자석 렌더러 (드래그앤드롭 로직 포함) ---
function renderFridge() {
    magnetCanvas.innerHTML = '';

    state.magnets.forEach(mag => {
        const magEl = document.createElement('div');
        magEl.classList.add('magnet');

        // 방금 부착된 자석(1초 이내)은 젤리 탄성 바운스 애니메이션 트리거
        if (Date.now() - mag.timestamp < 1000) {
            magEl.classList.add('just-snapped');
            setTimeout(() => {
                magEl.classList.remove('just-snapped');
            }, 580);
        }

        magEl.setAttribute('data-id', mag.id);
        magEl.style.setProperty('--magnet-color', COLOR_MAP[mag.color] || 'var(--color-sky-blue)');
        magEl.style.left = `${mag.x}%`;
        magEl.style.top = `${mag.y}%`;

        if (mag.type === 'emoji') {
            magEl.classList.add('emoji-type');
            magEl.innerHTML = `
                <div class="magnet-circle-text">
                    <span class="magnet-emoji">${mag.emoji}</span>
                    <span class="magnet-text">${escapeHTML(mag.label)}</span>
                </div>
                <span class="magnet-owner">${mag.owner}</span>
            `;
        } else if (mag.type === 'schedule') {
            magEl.classList.add('schedule-type');
            
            let ddayText = '';
            let dateText = '';
            
            if (mag.date) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const targetDate = new Date(mag.date);
                targetDate.setHours(0, 0, 0, 0);
                
                const diffTime = targetDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays === 0) ddayText = 'D-Day';
                else if (diffDays > 0) ddayText = `D-${diffDays}`;
                else ddayText = `D+${Math.abs(diffDays)}`;

                dateText = mag.date.substring(5).replace('-', '/');
            } else {
                ddayText = '가족 메모';
                dateText = '기록됨';
            }

            magEl.innerHTML = `
                <div class="schedule-clip-handle"></div>
                <span class="schedule-dday">${ddayText}</span>
                <div class="schedule-text">${escapeHTML(mag.text)}</div>
                <div class="schedule-date">${dateText}</div>
                <span class="schedule-owner">${mag.owner}</span>
            `;
        }

        makeElementDraggable(magEl, mag.id);
        magnetCanvas.appendChild(magEl);
    });
}

// --- 드래그 바인딩 엔진 ---
function makeElementDraggable(el, id) {
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;
    let isDragging = false;

    el.addEventListener('mousedown', dragStart);
    el.addEventListener('touchstart', dragStart, { passive: false });

    function dragStart(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        isDragging = true;
        el.classList.add('dragging');
        window.fridgeSounds.playDetach();

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;

        const rect = fridgeBoard.getBoundingClientRect();
        initialX = (parseFloat(el.style.left) / 100) * rect.width;
        initialY = (parseFloat(el.style.top) / 100) * rect.height;

        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
        
        if (e.type === 'touchstart') e.preventDefault();
    }

    function dragMove(e) {
        if (!isDragging) return;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        const rect = fridgeBoard.getBoundingClientRect();
        let newX = initialX + dx;
        let newY = initialY + dy;

        let pctX = (newX / rect.width) * 100;
        let pctY = (newY / rect.height) * 100;

        pctX = Math.max(-10, Math.min(110, pctX));
        pctY = Math.max(-10, Math.min(110, pctY));

        el.style.left = `${pctX}%`;
        el.style.top = `${pctY}%`;
        
        if (e.type === 'touchmove') e.preventDefault();
    }

    function dragEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('dragging');

        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('touchmove', dragMove);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchend', dragEnd);

        const pctX = parseFloat(el.style.left);
        const pctY = parseFloat(el.style.top);

        const rect = fridgeBoard.getBoundingClientRect();
        
        if (pctY > 92 || pctX < -5 || pctX > 105) {
            el.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            el.style.transform = 'scale(0) rotate(-20deg)';
            el.style.opacity = '0';
            
            window.fridgeSounds.playSwoosh();

            setTimeout(() => {
                removeMagnet(id);
            }, 300);
        } else {
            const finalX = Math.max(2, Math.min(80, pctX)); 
            const finalY = Math.max(2, Math.min(90, pctY));
            
            const magIndex = state.magnets.findIndex(m => m.id === id);
            if (magIndex !== -1) {
                state.magnets[magIndex].x = finalX;
                state.magnets[magIndex].y = finalY;
                
                if (state.magnets[magIndex].owner === state.activeUser.nickname) {
                    state.magnets[magIndex].timestamp = Date.now();
                    if (state.activeUser.role === 'parent') {
                        state.parentLastUpdateTime = Date.now();
                        hidePushNotification();
                    }
                }
                saveState();
            }

            el.style.left = `${finalX}%`;
            el.style.top = `${finalY}%`;

            // 스냅 바운스 애니메이션 트리거
            el.classList.add('just-snapped');
            setTimeout(() => {
                el.classList.remove('just-snapped');
            }, 580);

            window.fridgeSounds.playSnap();
            renderWidget();
        }
    }
}

function removeMagnet(id) {
    state.magnets = state.magnets.filter(m => m.id !== id);
    saveState();
    calculateParentLastUpdateTime();
    renderFridge();
    renderWidget();
}

// --- 위젯 렌더링 ---
function renderWidget() {
    widgetItemsContainer.innerHTML = '';
    
    if (state.magnets.length === 0) {
        widgetItemsContainer.innerHTML = '<div class="widget-empty">냉장고가 비어있습니다.</div>';
        widgetUpdateTime.textContent = '방금 전';
        return;
    }

    const sorted = [...state.magnets].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);

    sorted.forEach(mag => {
        const itemEl = document.createElement('div');
        itemEl.classList.add('widget-item');
        itemEl.style.setProperty('--item-color', COLOR_MAP[mag.color]);

        if (mag.type === 'emoji') {
            itemEl.innerHTML = `
                <span class="widget-item-emoji">${mag.emoji}</span>
                <div class="widget-item-content">
                    <span class="widget-item-name">${mag.owner}</span>
                    <span class="widget-item-text">${mag.label}</span>
                </div>
            `;
        } else if (mag.type === 'schedule') {
            let ddayText = '';
            
            if (mag.date) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const targetDate = new Date(mag.date);
                targetDate.setHours(0, 0, 0, 0);
                
                const diffTime = targetDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays === 0) ddayText = 'D-Day';
                else if (diffDays > 0) ddayText = `D-${diffDays}`;
                else ddayText = `D+${Math.abs(diffDays)}`;
            } else {
                ddayText = '메모';
            }

            itemEl.innerHTML = `
                <span class="widget-item-emoji"><i class="fa-solid fa-calendar-day"></i></span>
                <div class="widget-item-content">
                    <span class="widget-item-name">${mag.owner}</span>
                    <span class="widget-item-text">${mag.text}</span>
                </div>
                <span class="widget-item-dday">${ddayText}</span>
            `;
        }
        
        widgetItemsContainer.appendChild(itemEl);
    });

    widgetUpdateTime.textContent = '동기화 완료';
}

function saveState() {
    localStorage.setItem(state.storageKey, JSON.stringify(state.magnets));
    
    if (syncChannel) {
        syncChannel.postMessage({
            type: 'MAGNETS_UPDATE',
            data: { magnets: state.magnets }
        });
    }

    if (state.isFirebaseConnected && state.db) {
        state.db.ref(`rooms/${state.roomCode}/magnets`).set(state.magnets)
            .catch(err => console.error("Firebase sync error: ", err));
    }
}

// --- 안부 모니터링 ---
let isMonitoringRunning = false;
function startIdleMonitoring() {
    if (isMonitoringRunning) return;
    isMonitoringRunning = true;

    setInterval(() => {
        const baseIdleMs = Date.now() - state.parentLastUpdateTime;
        const speededMs = baseIdleMs * state.timeSpeedMultiplier;
        const totalIdleSeconds = Math.max(0, Math.floor(speededMs / 1000));

        updateIdleTimerDisplay(totalIdleSeconds);

        const thresholdSeconds = 48 * 60 * 60;
        
        if (totalIdleSeconds >= thresholdSeconds) {
            idleTimerDisplay.className = 'timer-danger';
            if (state.activeUser.role === 'child' && pushNotificationBanner.classList.contains('hidden')) {
                showPushNotification(`부모님 냉장고가 ${Math.floor(totalIdleSeconds / 3600)}시간째 고요합니다. 따뜻한 안부 전화를 걸어보시는 건 어떨까요?`);
            }
        } else {
            idleTimerDisplay.className = 'timer-normal';
            if (totalIdleSeconds < thresholdSeconds - 60) {
                hidePushNotification();
            }
        }
    }, 1000);
}

function updateIdleTimerDisplay(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');
    idleTimerDisplay.textContent = `${pad(hours)}시간 ${pad(minutes)}분 ${pad(seconds)}초`;
}

function showPushNotification(msg) {
    notificationMessage.textContent = msg;
    pushNotificationBanner.classList.remove('hidden');
    window.fridgeSounds.playDetach();
}

function hidePushNotification() {
    pushNotificationBanner.classList.add('hidden');
}

// --- 밤 12시 스케줄러 시뮬레이션 ---
function triggerMidnightCleanup() {
    const originalCount = state.magnets.length;

    state.magnets = state.magnets.filter(mag => {
        if (mag.type === 'emoji') return false; 
        
        if (mag.type === 'schedule') {
            if (!mag.date) return true;

            const today = new Date();
            today.setHours(0,0,0,0);
            const limitDate = new Date(mag.date);
            limitDate.setHours(0,0,0,0);
            return limitDate.getTime() >= today.getTime(); 
        }
        return true;
    });

    const deletedCount = originalCount - state.magnets.length;
    saveState();
    
    window.fridgeSounds.playSwoosh();
    calculateParentLastUpdateTime();
    renderFridge();
    renderWidget();

    alert(`밤 12시 스케줄러가 작동했습니다. 오늘의 일상 스티커 ${deletedCount}개가 자석 서랍으로 회수되었으며, 단순 기록 메모 및 미래의 일정은 안전하게 유지됩니다.`);
}

function forceIdleTrigger() {
    state.parentLastUpdateTime = Date.now() - 48.2 * 60 * 60 * 1000;
    calculateParentLastUpdateTime();
    renderFridge();
    renderWidget();
}

function clearAllMagnets() {
    if (confirm('냉장고의 모든 자석을 떼어낼까요?')) {
        state.magnets = [];
        saveState();
        window.fridgeSounds.playSwoosh();
        state.parentLastUpdateTime = Date.now() - 48.5 * 60 * 60 * 1000;
        renderFridge();
        renderWidget();
    }
}

// --- Firebase 연결 ---
function connectFirebase() {
    const configStr = fbConfigJson.value.trim();
    if (!configStr) {
        alert('Firebase Config JSON 문자열을 입력해 주세요.');
        return;
    }

    try {
        const config = JSON.parse(configStr);
        if (firebase.apps.length > 0) {
            firebase.app().delete();
        }

        firebase.initializeApp(config);
        state.db = firebase.database();
        state.isFirebaseConnected = true;

        state.db.ref(`rooms/${state.roomCode}/magnets`).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                state.magnets = data;
                calculateParentLastUpdateTime();
                renderFridge();
                renderWidget();
            }
        });

        state.db.ref(`rooms/${state.roomCode}/title`).on('value', (snapshot) => {
            const titleVal = snapshot.val();
            if (titleVal) {
                state.fridgeTitle = titleVal;
                if (fridgeTitleDisplay) fridgeTitleDisplay.textContent = titleVal;
                if (fridgeTitleInput) fridgeTitleInput.value = titleVal;
            }
        });

        alert(`Firebase와 연결되었습니다! 이제 '${state.roomCode}' 코드를 공유하는 가족 간에 크로스 디바이스 동기화가 활성화됩니다.`);
    } catch (err) {
        alert('JSON 설정 또는 Firebase 연결 실패: \n' + err.message);
    }
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
