(() => {
  // ---------------------------------------------------------
  // [날짜 관리 기능]
  // ---------------------------------------------------------
  const renderTodayDate = () => {
    const plannerDateEl = document.querySelector("#planner-today-date");
    const rankingDateEl = document.querySelector("#ranking-today-date");

    if (!plannerDateEl && !rankingDateEl) return;

    const today = new Date();

    const formatter = new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long"
    });

    const formattedDate = formatter.format(today);

    if (plannerDateEl) plannerDateEl.textContent = `[${formattedDate}]`;
    if (rankingDateEl) rankingDateEl.textContent = `${formattedDate} 기준`;
  };

  renderTodayDate();

  const root = document.documentElement;
  const SESSION_KEY = "opensourcePlannerSession";
  const USERS_KEY = "opensourcePlannerUsers";

  const readSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("세션 읽기 실패:", e);
      return null;
    }
  };

  const writeSession = (name, email) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ name, email }));
    } catch (e) {
      console.warn("세션 저장 실패 (localStorage 사용 불가):", e);
    }
  };

  const clearSession = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn("세션 삭제 실패 (localStorage 사용 불가):", e);
    }
  };

  const saveUser = (name, email) => {
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      const idx = users.findIndex((u) => u.email === email);
      if (idx >= 0) users[idx] = { name, email };
      else users.push({ name, email });
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.warn("사용자 저장 실패 (localStorage 사용 불가):", e);
    }
  };

  const findUser = (email) => {
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      return users.find((u) => u.email === email) || null;
    } catch (e) {
      console.warn("사용자 조회 실패:", e);
      return null;
    }
  };

  const normalizePath = (p) => p.replace(/\\/g, "/");
  const pathname = normalizePath(location.pathname);
  const currentFile = pathname.split("/").pop() || "index.html";
  const indexHref = currentFile === "index.html" ? "./index.html" : "../index.html";

  const session = readSession();

  if (currentFile === "planner.html" && !session) {
    location.replace("./login.html");
    return;
  }

  if ((currentFile === "login.html" || currentFile === "signup.html") && session) {
    location.replace("./planner.html");
    return;
  }

  const storedTheme = localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    root.dataset.theme = storedTheme;
  }

  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const navToggle = document.querySelector("[data-nav-toggle]");
  const navList = document.querySelector("[data-nav-list]");
  if (navToggle && navList) {
    navToggle.addEventListener("click", () => {
      const isOpen = navList.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navList.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      navList.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  }

  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = root.dataset.theme === "light" ? "light" : "dark";
      const next = current === "light" ? "dark" : "light";
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
    });
  }

  // 헤더 프로필 / 로그인 버튼 동적 렌더링
  const headerActions = document.querySelector(".header-actions");
  if (headerActions) {
    if (session) {
      const initials = (session.name || session.email || "?").charAt(0).toUpperCase();
      const displayName = session.name || session.email;
      headerActions.innerHTML = `
        <div class="user-profile">
          <span class="user-avatar" aria-hidden="true">${initials}</span>
          <span class="user-name">${displayName}</span>
        </div>
        <button class="btn btn-ghost" type="button" data-logout>로그아웃</button>
      `;
      headerActions.querySelector("[data-logout]").addEventListener("click", () => {
        clearSession();
        location.href = indexHref;
      });
    }
  }

  const startLink = document.querySelector("[data-start-link]");
  if (startLink) {
    const guest = startLink.getAttribute("data-href-guest") || "./pages/login.html";
    const authed = startLink.getAttribute("data-href-auth") || "./pages/planner.html";
    startLink.setAttribute("href", session ? authed : guest);
  }

  // ---------------------------------------------------------
  // [로그인 처리]
  // ---------------------------------------------------------
  const loginForm = document.querySelector('form[data-auth="login"]');
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!loginForm.checkValidity()) {
        loginForm.reportValidity();
        return;
      }

      const email = loginForm.querySelector('[name="email"]').value.trim();
      const password = loginForm.querySelector('[name="password"]').value;

      try {
        const response = await fetch("http://127.0.0.1:8000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem("access_token", data.access_token);
          writeSession(data.nickname, data.email);
          location.href = "./planner.html";
        } else {
          alert("로그인 실패:\n" + (typeof data.detail === "object" ? JSON.stringify(data.detail, null, 2) : data.detail));
        }
      } catch (error) {
        console.error("백엔드 통신 실패:", error);
        alert("서버와 연결할 수 없습니다.");
      }
    });
  }

  // ---------------------------------------------------------
  // [회원가입 처리]
  // ---------------------------------------------------------
  const signupForm = document.querySelector('form[data-auth="signup"]');
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!signupForm.checkValidity()) {
        signupForm.reportValidity();
        return;
      }

      const name = signupForm.querySelector('[name="name"]').value.trim();
      const email = signupForm.querySelector('[name="email"]').value.trim();
      const password = signupForm.querySelector('[name="password"]').value;

      try {
        const response = await fetch("http://127.0.0.1:8000/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, nickname: name, password })
        });

        const data = await response.json();

        if (response.ok) {
          alert("회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.");
          location.href = "./login.html";
        } else {
          alert(data.detail || "회원가입에 실패했습니다.");
        }
      } catch (error) {
        console.error("백엔드 통신 실패:", error);
        alert("서버와 연결할 수 없습니다.");
      }
    });
  }

  // ---------------------------------------------------------
  // [AI 플래너 기능]
  // ---------------------------------------------------------
  const todoForm = document.querySelector("#todo-form");
  const todoContainer = document.querySelector("#todo-list-container");
  const emptyMessage = document.querySelector("#empty-message");

  const getAuthHeaders = () => {
    const token = localStorage.getItem("access_token");
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  // =========================================================
  // ⭐ [마라톤 모션 + 시간 진행도] — 단일 세션 모델
  //
  //   설계:
  //   1) 디폴트는 무조건 idle.
  //   2) 체크박스 체크 → 그 미션 AI 점수만큼의 "거리"를 가진 한 번의 운동 세션 시작.
  //        AI 1~20점   → walk (speed 0.2 / s)
  //        AI 21~50점  → run  (speed 0.7 / s)
  //      그 거리(=점수)를 시간으로 다 차오르면 → idle 자동 복귀.
  //   3) 체크 도중 다른 체크가 들어오면 새 세션이 이전 세션을 덮어씀.
  //      (이전 세션의 미완료 잔여 거리는 폐기, 단 이미 누적된 progress 는 유지)
  //   4) 언체크 / 삭제 / F5 / 재진입 → 즉시 idle, 진행 중인 세션 취소.
  //   5) 진행도 바 = 모든 운동 세션의 누적 거리 / 등록된 미션 점수 합.
  // =========================================================
  const MOTION_SPEED = { IDLE: 0, WALK: 0.2, RUN: 0.7 }; // marathon.js 내부 SPEED 와 동일
  const PROGRESS_TICK_MS = 100;
  const SPEED_MULTIPLIER = 2; // 진행도 차오르는 속도 배율 (시연용)

  let progressGoal = 0;            // = totalPossibleScore (등록된 모든 미션 AI 점수 합)
  let progressAccumulated = 0;     // 시간으로 차오른 누적 진행도

  let activeSessionScore = 0;      // 현재 운동 세션의 미션 AI 점수 (모션 종류 결정)
  let activeSessionRemaining = 0;  // 이번 세션에서 아직 차오를 거리

  let progressTimer = null;
  let lastTickTimestamp = null;

  let isFirstTodoLoad = true;      // 새로고침/첫 진입 시 DB 완료 점수로 진행도 시드

  const scoreToRate = (aiScore) => {
    if (!aiScore || aiScore <= 0) return 0;
    if (aiScore <= 20) return 0.3;
    return 0.8;
  };

  const scoreToSpeed = (aiScore) => {
    const rate = scoreToRate(aiScore);
    if (rate === 0) return MOTION_SPEED.IDLE;
    if (rate === 0.3) return MOTION_SPEED.WALK;
    return MOTION_SPEED.RUN;
  };

  const applyMotion = (aiScore) => {
    if (typeof window.setMotionState !== "function") return;
    window.setMotionState(scoreToRate(aiScore));
  };

  // 체크 시 호출: 새 운동 세션 시작 (이전 세션 덮어쓰기)
  const startMotionSession = (missionScore) => {
    activeSessionScore = missionScore;
    activeSessionRemaining = missionScore;
    applyMotion(missionScore);
  };

  // 언체크/삭제/리셋 시 호출: 즉시 idle
  const cancelMotionSession = () => {
    activeSessionScore = 0;
    activeSessionRemaining = 0;
    applyMotion(0);
  };

  const renderProgressBar = () => {
    const fill = document.querySelector("#progress-fill");
    const character = document.querySelector("#progress-character");
    const text = document.querySelector("#progress-text");
    if (!fill || !character || !text) return;

    const goalForCalc = progressGoal > 0 ? progressGoal : 1;
    let percentage = (progressAccumulated / goalForCalc) * 100;
    if (percentage > 100) percentage = 100;
    if (percentage < 0) percentage = 0;

    fill.style.width = `${percentage}%`;
    character.style.left = `calc(${percentage}% - 18px)`;

    const displayAccum = Math.min(progressAccumulated, progressGoal);
    text.textContent = `${displayAccum.toFixed(1)} / ${progressGoal} 점 (목표)`;
  };

  const tickProgress = () => {
    const now = Date.now();
    const delta = lastTickTimestamp ? (now - lastTickTimestamp) / 1000 : 0;
    lastTickTimestamp = now;

    if (activeSessionRemaining > 0) {
      const speed = scoreToSpeed(activeSessionScore) * SPEED_MULTIPLIER;
      const consumed = Math.min(speed * delta, activeSessionRemaining);
      activeSessionRemaining -= consumed;
      progressAccumulated += consumed;

      // 진행도 클램프
      if (progressGoal > 0 && progressAccumulated > progressGoal) {
        progressAccumulated = progressGoal;
      }

      // 이번 세션 완료 → 자동 idle
      if (activeSessionRemaining <= 0) {
        activeSessionScore = 0;
        applyMotion(0);
      }
    }

    renderProgressBar();
    if (currentRival) updateRivalUI(); // 내 진행도가 바뀔 때마다 라이벌 상대 위치도 다시 계산
  };

  const startProgressTimer = () => {
    if (progressTimer) return;
    lastTickTimestamp = Date.now();
    progressTimer = setInterval(tickProgress, PROGRESS_TICK_MS);
  };

  startProgressTimer();

  // =========================================================
  // ⭐ [라이벌(타인) 동기화]
  //
  //   /rankings 에서 본인 제외 1위를 라이벌로 선정.
  //   라이벌의 점수(total_score, DB 완료 점수 합)와 내 progressAccumulated 를 비교해서
  //     - 3D 씬 안에서 옆 차선에 캐릭터 배치, 거리 차이로 z 위치 표현
  //     - UI 박스에 "X점 앞" / "X점 뒤" 텍스트로 표시
  // =========================================================
  const RIVAL_LANE_X = 1.2;            // 트랙 옆 차선
  const RIVAL_Z_SCALE = 5;             // 1점당 5 unit (시각적 변화량 강조)
  const RIVAL_COLOR = 0xff6b6b;        // 라이벌 색상 (빨강 계열)

  // 가시성 범위 (점수 차 diff = rivalScore - myProgress 기준)
  //   diff > +5  → 라이벌이 5점 이상 앞섬 → 너무 멀어서 안 보임
  //   diff < -2  → 내가 2점 이상 추월 → 뒤로 사라짐
  const RIVAL_VISIBLE_FAR_MAX = 5;     // 라이벌이 앞설 때 보이는 최대 점수 차
  const RIVAL_VISIBLE_NEAR_MAX = 2;    // 내가 앞설 때 보이는 최대 점수 차 (추월 거리)

  let currentRival = null;             // { nickname, score }

  const updateRivalUI = () => {
    const boxEl = document.querySelector("#rival-info");
    const nameEl = document.querySelector("#rival-name");
    const statusEl = document.querySelector("#rival-status");

    if (!currentRival) {
      if (boxEl) boxEl.style.display = "none";
      if (typeof window.updateRival === "function") {
        window.updateRival({ visible: false });
      }
      return;
    }

    const diff = currentRival.score - progressAccumulated; // 양수 = 라이벌 앞섬

    // ⭐ 가시성 판정: -RIVAL_VISIBLE_NEAR_MAX ≤ diff ≤ +RIVAL_VISIBLE_FAR_MAX 일 때만 보임
    const visible = (diff >= -RIVAL_VISIBLE_NEAR_MAX) && (diff <= RIVAL_VISIBLE_FAR_MAX);

    if (!visible) {
      // 범위 밖 → 3D 캐릭터 숨김 + UI 박스 숨김
      if (typeof window.updateRival === "function") {
        window.updateRival({ visible: false });
      }
      if (boxEl) boxEl.style.display = "none";
      return;
    }

    // 범위 안 → 3D 캐릭터 보임 + 위치 갱신
    const z = diff * RIVAL_Z_SCALE;
    if (typeof window.updateRival === "function") {
      window.updateRival({ visible: true, x: RIVAL_LANE_X, z, motion: "idle" });
    }

    // UI 텍스트
    if (boxEl) boxEl.style.display = "block";
    if (nameEl) nameEl.textContent = currentRival.nickname;
    if (statusEl) {
      if (Math.abs(diff) < 0.5) {
        statusEl.textContent = "🟰 거의 동률";
        statusEl.style.color = "var(--brand2)";
      } else if (diff > 0) {
        statusEl.textContent = `🐢 ${diff.toFixed(1)}점 뒤쳐짐`;
        statusEl.style.color = "#ef4444";
      } else {
        statusEl.textContent = `🏃‍♂️💨 ${Math.abs(diff).toFixed(1)}점 추월 중`;
        statusEl.style.color = "#22c55e";
      }
    }
  };

  // ---------------------------------------------------------
  // [기능 1] 개별 카드 렌더링
  // ---------------------------------------------------------
  const renderTodoCard = (todo) => {
    const card = document.createElement("div");
    card.className = "tile";

    card.style.borderLeft = todo.is_completed ? "4px solid var(--muted)" : "4px solid var(--brand)";
    card.style.opacity = todo.is_completed ? "0.5" : "1";
    card.style.transition = "all 0.2s ease-in-out";

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div style="display: flex; gap: 0.8rem; align-items: start;">
          <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" ${todo.is_completed ? "checked" : ""} style="margin-top: 0.35rem; transform: scale(1.3); cursor: pointer;" />
          <div>
            <h3 style="margin: 0 0 0.35rem 0; text-decoration: ${todo.is_completed ? 'line-through' : 'none'};">${todo.task_name}</h3>
            <p class="muted small" style="margin: 0;">${todo.reason || "AI 분석 완료"}</p>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; flex-shrink: 0;">
          <span class="pill" style="font-weight: 700; color: ${todo.is_completed ? 'var(--muted)' : 'var(--brand)'};">+ ${todo.score}점</span>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-ghost edit-btn" data-id="${todo.id}" data-task="${todo.task_name}" style="color: var(--text); border: none; cursor: pointer; padding: 0.2rem; font-size: 1.2rem;" title="수정">✏️</button>
            <button class="btn-ghost delete-btn" data-id="${todo.id}" style="color: #ef4444; border: none; cursor: pointer; padding: 0.2rem; font-size: 1.2rem;" title="삭제">🗑️</button>
          </div>
        </div>
      </div>
    `;

    const checkbox = card.querySelector(".todo-checkbox");
    checkbox.addEventListener("change", async (e) => {
      const todoId = e.target.getAttribute("data-id");
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, {
          method: "PATCH",
          headers: getAuthHeaders()
        });

        if (response.ok) {
          const result = await response.json();

          if (result.is_completed) {
            // ⭐ 체크됨 → 이 미션 점수만큼의 운동 세션 시작 (이전 세션 덮어씀)
            startMotionSession(todo.score);
          } else {
            // ⭐ 언체크됨 → 즉시 idle, 진행 중인 세션 취소
            cancelMotionSession();
          }
          loadTodos();
          loadRankings();
        } else {
          alert("상태 업데이트에 실패했습니다.");
          e.target.checked = !e.target.checked;
        }
      } catch (error) {
        console.error("통신 에러:", error);
        e.target.checked = !e.target.checked;
      }
    });

    const editBtn = card.querySelector(".edit-btn");
    editBtn.addEventListener("click", async (e) => {
      const todoId = e.currentTarget.getAttribute("data-id");
      const currentTask = e.currentTarget.getAttribute("data-task");

      const newTaskName = prompt("수정할 과제 내용을 입력하세요:", currentTask);

      if (!newTaskName || newTaskName.trim() === "" || newTaskName === currentTask) return;

      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ task_name: newTaskName.trim() })
        });

        if (response.status === 401) { location.replace("./login.html"); return; }
        if (response.ok) { loadTodos(); }
        else alert("수정에 실패했습니다.");
      } catch (error) { console.error("수정 통신 에러:", error); }
    });

    const deleteBtn = card.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", async (e) => {
      if (!confirm("정말 이 과제를 삭제할까요?")) return;
      const todoId = e.currentTarget.getAttribute("data-id");
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, { method: "DELETE", headers: getAuthHeaders() });
        if (response.ok) {
          // ⭐ 삭제 시 즉시 idle (디폴트 상태)
          cancelMotionSession();
          loadTodos();
          loadRankings();
        }
        else alert("삭제에 실패했습니다.");
      } catch (error) { console.error("삭제 통신 에러:", error); }
    });

    todoContainer.appendChild(card);
  };

  // ---------------------------------------------------------
  // [기능 2] 헤더 점수 배지 (완료한 미션 AI 점수 합)
  // ---------------------------------------------------------
  const updateScoreBadge = (completedScore) => {
    let scoreBadge = document.querySelector("#user-score-badge");
    if (!scoreBadge) {
      const headerActionsEl = document.querySelector(".header-actions");
      if (headerActionsEl) {
        scoreBadge = document.createElement("div");
        scoreBadge.id = "user-score-badge";
        scoreBadge.className = "badge";
        scoreBadge.style.margin = "0 1rem 0 0";
        scoreBadge.style.background = "rgba(167, 139, 250, 0.15)";
        scoreBadge.style.borderColor = "rgba(167, 139, 250, 0.3)";
        headerActionsEl.prepend(scoreBadge);
      }
    }
    if (scoreBadge) {
      scoreBadge.innerHTML = `🏆 진행 점수: <strong>${completedScore} 점</strong>`;
    }
  };

  // ---------------------------------------------------------
  // [기능 3] 데이터 로드 + 마라톤 fallback + 진행도 목표 갱신
  // ---------------------------------------------------------
  const loadTodos = async () => {
    if (!todoContainer) return;

    try {
      const response = await fetch("http://127.0.0.1:8000/todos", {
        method: "GET",
        headers: getAuthHeaders()
      });

      if (response.status === 401) {
        alert("로그인 시간이 만료되었습니다.");
        localStorage.clear();
        location.replace("./login.html");
        return;
      }

      const result = await response.json();

      if (response.ok) {
        if (emptyMessage) emptyMessage.style.display = result.data.length === 0 ? "block" : "none";
        todoContainer.querySelectorAll(".tile").forEach(el => el.remove());

        let totalCompletedScore = 0;
        let totalPossibleScore = 0;

        result.data.forEach(todo => {
          renderTodoCard(todo);
          totalPossibleScore += todo.score;
          if (todo.is_completed) {
            totalCompletedScore += todo.score;
          }
        });

        // 헤더 배지 갱신 (완료한 미션 AI 점수 합 — DB 기반, 마라톤 진행도와 별개)
        updateScoreBadge(totalCompletedScore);

        // ⭐ 진행도 목표 갱신
        progressGoal = totalPossibleScore;

        // ⭐ 새로고침/첫 진입 시 DB 의 완료 점수로 진행도 시드 (한 번만)
        //   캐릭터 모션은 디폴트 idle 유지. 이후 체크 이벤트부터 시간 누적 시작.
        if (isFirstTodoLoad) {
          progressAccumulated = totalCompletedScore;
          isFirstTodoLoad = false;
        }

        if (progressGoal === 0) {
          progressAccumulated = 0;
          cancelMotionSession();
        } else if (progressAccumulated > progressGoal) {
          progressAccumulated = progressGoal;
        }

        renderProgressBar();
        loadRankings();
      }
    } catch (error) {
      console.error("할 일 목록 로드 실패:", error);
    }
  };

  // ---------------------------------------------------------
  // [랭킹]
  // ---------------------------------------------------------
  const rankingContainer = document.querySelector("#ranking-list-container");

  const loadRankings = async () => {
    if (!rankingContainer) return;

    try {
      const response = await fetch("http://127.0.0.1:8000/rankings", { method: "GET" });
      const result = await response.json();

      if (response.ok) {
        rankingContainer.innerHTML = "";

        // ⭐ 라이벌 결정: 본인 제외 1위 (없으면 그냥 첫 번째)
        const myNickname = session ? session.name : null;
        const rivalCandidate = (result.data || []).find(u => u.nickname !== myNickname);

        if (rivalCandidate) {
          currentRival = {
            nickname: rivalCandidate.nickname,
            score: Number(rivalCandidate.total_score) || 0
          };
          // 라이벌 캐릭터를 3D 씬에 추가 (이미 있으면 내부 가드로 무시)
          if (typeof window.addRival === "function") {
            try {
              await window.addRival({ x: RIVAL_LANE_X, z: 5, color: RIVAL_COLOR });
            } catch (e) { console.warn("라이벌 캐릭터 추가 실패:", e); }
          }
          updateRivalUI();
        } else {
          // 라이벌 없음 → 정리
          currentRival = null;
          if (typeof window.removeRival === "function") window.removeRival();
          updateRivalUI();
        }

        if (!result.data || result.data.length === 0) {
          rankingContainer.innerHTML = `<p class="muted" style="margin: 0;">아직 랭킹에 등록된 유저가 없습니다.</p>`;
          return;
        }

        result.data.forEach((userRank) => {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.padding = "0.75rem 1rem";
          row.style.borderRadius = "10px";

          row.style.background = userRank.rank === 1 ? "rgba(234, 179, 8, 0.12)" : "rgba(255, 255, 255, 0.02)";
          row.style.border = userRank.rank === 1 ? "1px solid rgba(234, 179, 8, 0.3)" : "1px solid var(--border)";

          row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
              <span style="font-weight: 800; color: ${userRank.rank === 1 ? '#eab308' : 'var(--muted)'}; width: 35px;">
                ${userRank.rank}위
              </span>
              <span style="font-weight: 600; color: var(--text);">${userRank.nickname}</span>
            </div>
            <span style="font-weight: 700; color: var(--brand2);">${userRank.total_score} 점</span>
          `;
          rankingContainer.appendChild(row);
        });
      }
    } catch (error) {
      console.error("랭킹 데이터 로드 실패:", error);
    }
  };

  // ---------------------------------------------------------
  // [기능 4] 새 미션 추가 + AI 채점 요청
  // ---------------------------------------------------------
  if (todoForm) {
    todoForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const taskInput = document.querySelector("#task-input");
      const submitBtn = todoForm.querySelector('button[type="submit"]');
      const taskValue = taskInput.value.trim();
      if (!taskValue) return;

      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "⏳ AI가 난이도를 분석 중입니다...";
      submitBtn.style.opacity = "0.7";
      submitBtn.style.cursor = "not-allowed";

      try {
        const response = await fetch("http://127.0.0.1:8000/analyze-todo", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ tasks: [taskValue] })
        });

        const result = await response.json();

        if (response.status === 401) {
          alert("보안을 위해 세션이 만료되었습니다. 다시 로그인해 주세요.");
          localStorage.clear();
          location.replace("./login.html");
          return;
        }

        if (response.ok) {
          if (emptyMessage) emptyMessage.style.display = "none";
          taskInput.value = "";

          if (result.data && result.data.length > 0) {
            result.data.forEach(newTodo => renderTodoCard(newTodo));
          }
          loadTodos();
          alert(result.message || "AI 가 과제 점수를 성공적으로 할당했습니다!");
        } else {
          alert(result.detail || "인공지능 분석 중 오류가 발생했습니다.");
        }
      } catch (error) {
        console.error("AI 요청 실패:", error);
        alert("서버와 연결 상태가 불안정합니다.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
      }
    });
  }

  // 페이지 진입 시 첫 로드
  loadTodos();
  loadRankings();

  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const file = normalizePath(href).split("/").pop();
    if (!file) return;
    if (file === currentFile) link.classList.add("active");
  });
})();
