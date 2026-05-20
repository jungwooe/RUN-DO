(() => {
  // 오늘 날짜를 한국어 형식으로 렌더링
  const renderTodayDate = () => {
    const plannerDateEl = document.querySelector("#planner-today-date");
    const rankingDateEl = document.querySelector("#ranking-today-date");
    if (!plannerDateEl && !rankingDateEl) return;
    const today = new Date();
    const formatter = new Intl.DateTimeFormat("ko-KR", {
      month: "long", day: "numeric", weekday: "long"
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
      console.warn("세션 저장 실패:", e);
    }
  };

  const clearSession = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn("세션 삭제 실패:", e);
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
      console.warn("사용자 저장 실패:", e);
    }
  };

  const findUser = (email) => {
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
      return users.find((u) => u.email === email) || null;
    } catch (e) {
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
      if (!e.target.closest("a")) return;
      navList.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  }

  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      localStorage.setItem("theme", next);
    });
  }

  // 헤더 프로필 드롭다운 동적 렌더링
  const headerActions = document.querySelector(".header-actions");
  if (headerActions && session) {
    const initials = (session.name || session.email || "?").charAt(0).toUpperCase();
    const displayName = session.name || session.email;
    headerActions.innerHTML = `
      <div class="profile-btn-wrapper">
        <button class="user-profile" type="button" data-profile-toggle aria-expanded="false" aria-controls="profile-dropdown" aria-label="프로필 메뉴">
          <span class="user-avatar" aria-hidden="true">${initials}</span>
          <span class="user-name">${displayName}</span>
        </button>

        <div class="profile-dropdown" id="profile-dropdown" aria-hidden="true">
          <div class="profile-dropdown-top">
            <span class="profile-dropdown-email">${session.email || displayName}</span>
            <button class="profile-dropdown-x" id="profile-dropdown-x" aria-label="닫기">✕</button>
          </div>
          <div class="profile-dropdown-body">
            <div class="profile-avatar-xl" aria-hidden="true">${initials}</div>
            <p class="profile-greeting">안녕하세요, <strong>${displayName}</strong>님.</p>
          </div>
          <button class="btn profile-planner-btn" id="open-planner-history">📋 플래너 몰아보기</button>
          <div class="profile-dropdown-footer">
            <button class="btn btn-ghost profile-logout-btn" data-logout>로그아웃</button>
          </div>
        </div>
      </div>
    `;

    // 로그아웃
    headerActions.querySelector("[data-logout]").addEventListener("click", () => {
      clearSession();
      location.href = indexHref;
    });

    // 드롭다운 토글
    const profileToggle = headerActions.querySelector("[data-profile-toggle]");
    const profileDropdown = document.querySelector("#profile-dropdown");

    const openDropdown = () => {
      profileDropdown.classList.add("open");
      profileDropdown.setAttribute("aria-hidden", "false");
      profileToggle.setAttribute("aria-expanded", "true");
    };
    const closeDropdown = () => {
      profileDropdown.classList.remove("open");
      profileDropdown.setAttribute("aria-hidden", "true");
      profileToggle.setAttribute("aria-expanded", "false");
    };

    profileToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.contains("open") ? closeDropdown() : openDropdown();
    });

    document.querySelector("#profile-dropdown-x")?.addEventListener("click", closeDropdown);

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".profile-btn-wrapper")) closeDropdown();
    });

    // 플래너 몰아보기 → 프로필 드로어 오픈
    document.querySelector("#open-planner-history")?.addEventListener("click", () => {
      closeDropdown();
      openProfileDrawer();
    });
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
      if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }
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
      if (!signupForm.checkValidity()) { signupForm.reportValidity(); return; }
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

    card.querySelector(".todo-checkbox").addEventListener("change", async (e) => {
      const todoId = e.target.getAttribute("data-id");
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, {
          method: "PATCH", headers: getAuthHeaders()
        });
        if (response.ok) { loadTodos(); loadRankings(); }
        else { alert("상태 업데이트에 실패했습니다."); e.target.checked = !e.target.checked; }
      } catch (error) { console.error("통신 에러:", error); e.target.checked = !e.target.checked; }
    });

    card.querySelector(".edit-btn").addEventListener("click", async (e) => {
      const todoId = e.currentTarget.getAttribute("data-id");
      const currentTask = e.currentTarget.getAttribute("data-task");
      const newTaskName = prompt("수정할 과제 내용을 입력하세요:", currentTask);
      if (!newTaskName || newTaskName.trim() === "" || newTaskName === currentTask) return;
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, {
          method: "PUT", headers: getAuthHeaders(),
          body: JSON.stringify({ task_name: newTaskName.trim() })
        });
        if (response.status === 401) { location.replace("./login.html"); return; }
        if (response.ok) { loadTodos(); }
        else alert("수정에 실패했습니다.");
      } catch (error) { console.error("수정 통신 에러:", error); }
    });

    card.querySelector(".delete-btn").addEventListener("click", async (e) => {
      if (!confirm("정말 이 과제를 삭제할까요?")) return;
      const todoId = e.currentTarget.getAttribute("data-id");
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, {
          method: "DELETE", headers: getAuthHeaders()
        });
        if (response.ok) { loadTodos(); loadRankings(); }
        else alert("삭제에 실패했습니다.");
      } catch (error) { console.error("삭제 통신 에러:", error); }
    });

    todoContainer.appendChild(card);
  };

  const updateScoreUI = (completedScore, possibleScore) => {
    let scoreBadge = document.querySelector("#user-score-badge");
    if (!scoreBadge) {
      const ha = document.querySelector(".header-actions");
      if (ha) {
        scoreBadge = document.createElement("div");
        scoreBadge.id = "user-score-badge";
        scoreBadge.className = "badge";
        scoreBadge.style.cssText = "margin:0 1rem 0 0; background:rgba(167,139,250,.15); border-color:rgba(167,139,250,.3);";
        ha.prepend(scoreBadge);
      }
    }
    if (scoreBadge) scoreBadge.innerHTML = `🏆 진행 점수: <strong>${completedScore} 점</strong>`;

    const fill = document.querySelector("#progress-fill");
    const character = document.querySelector("#progress-character");
    const text = document.querySelector("#progress-text");
    if (fill && character && text) {
      const targetScore = possibleScore > 0 ? possibleScore : 100;
      let percentage = Math.min((completedScore / targetScore) * 100, 100);
      fill.style.width = `${percentage}%`;
      character.style.left = `calc(${percentage}% - 18px)`;
      text.textContent = `${completedScore} / ${possibleScore} 점 (목표)`;
    }
  };

  const loadTodos = async () => {
    if (!todoContainer) return;
    try {
      const response = await fetch("http://127.0.0.1:8000/todos", {
        method: "GET", headers: getAuthHeaders()
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
        let totalScore = 0;
        let totalPossibleScore = 0;
        result.data.forEach(todo => {
          renderTodoCard(todo);
          totalPossibleScore += todo.score;
          if (todo.is_completed) totalScore += todo.score;
        });
        updateScoreUI(totalScore, totalPossibleScore);
        loadRankings();
      }
    } catch (error) {
      console.error("할 일 목록 로드 실패:", error);
    }
  };

  // ---------------------------------------------------------
  // [랭킹 기능]
  // ---------------------------------------------------------
  const rankingContainer = document.querySelector("#ranking-list-container");

  const loadRankings = async () => {
    if (!rankingContainer) return;
    try {
      const response = await fetch("http://127.0.0.1:8000/rankings");
      const result = await response.json();
      if (response.ok) {
        rankingContainer.innerHTML = "";
        if (!result.data || result.data.length === 0) {
          rankingContainer.innerHTML = `<p class="muted" style="margin:0;">아직 랭킹에 등록된 유저가 없습니다.</p>`;
          return;
        }
        result.data.forEach((userRank) => {
          const row = document.createElement("div");
          row.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding:.75rem 1rem; border-radius:10px; background:${userRank.rank === 1 ? 'rgba(234,179,8,.12)' : 'rgba(255,255,255,.02)'}; border:1px solid ${userRank.rank === 1 ? 'rgba(234,179,8,.3)' : 'var(--border)'};`;
          row.innerHTML = `
            <div style="display:flex; align-items:center; gap:1rem;">
              <span style="font-weight:800; color:${userRank.rank === 1 ? '#eab308' : 'var(--muted)'}; width:35px;">${userRank.rank}위</span>
              <span style="font-weight:600;">${userRank.nickname}</span>
            </div>
            <span style="font-weight:700; color:var(--brand2);">${userRank.total_score} 점</span>
          `;
          rankingContainer.appendChild(row);
        });
      }
    } catch (error) {
      console.error("랭킹 데이터 로드 실패:", error);
    }
  };

  // ---------------------------------------------------------
  // [공유 드로어 오버레이]
  // ---------------------------------------------------------
  const drawerOverlay = document.querySelector("#drawer-overlay");

  const closeAllDrawers = () => {
    document.querySelector("#ranking-drawer")?.classList.remove("open");
    document.querySelector("#profile-drawer")?.classList.remove("open");
    drawerOverlay?.classList.remove("active");
    document.querySelector("#ranking-toggle-btn")?.setAttribute("aria-expanded", "false");
    document.querySelector("[data-profile-toggle]")?.setAttribute("aria-expanded", "false");
  };

  drawerOverlay?.addEventListener("click", closeAllDrawers);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDrawers();
  });

  // ---------------------------------------------------------
  // [랭킹 드로어]
  // ---------------------------------------------------------
  const rankingToggleBtn = document.querySelector("#ranking-toggle-btn");
  const rankingDrawer = document.querySelector("#ranking-drawer");
  const rankingDrawerClose = document.querySelector("#ranking-drawer-close");

  const openRankingDrawer = () => {
    closeAllDrawers();
    rankingDrawer?.classList.add("open");
    drawerOverlay?.classList.add("active");
    rankingToggleBtn?.setAttribute("aria-expanded", "true");
    rankingDrawer?.setAttribute("aria-hidden", "false");
    loadRankings();
    rankingDrawerClose?.focus();
  };

  rankingToggleBtn?.addEventListener("click", () => {
    rankingDrawer?.classList.contains("open") ? closeAllDrawers() : openRankingDrawer();
  });
  rankingDrawerClose?.addEventListener("click", closeAllDrawers);

  // ---------------------------------------------------------
  // [프로필 드로어]
  // ---------------------------------------------------------
  const profileDrawer = document.querySelector("#profile-drawer");
  const profileDrawerClose = document.querySelector("#profile-drawer-close");
  const profileContent = document.querySelector("#profile-content");

  const renderProfileContent = async () => {
    if (!profileContent) return;
    profileContent.innerHTML = `<p class="muted">불러오는 중...</p>`;

    try {
      const response = await fetch("http://127.0.0.1:8000/todos", {
        method: "GET", headers: getAuthHeaders()
      });
      if (response.status === 401) {
        profileContent.innerHTML = `<p class="muted">로그인이 필요합니다.</p>`;
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error("API 오류");

      const todos = result.data || [];
      const completed = todos.filter(t => t.is_completed);
      const pending = todos.filter(t => !t.is_completed);
      const completedScore = completed.reduce((s, t) => s + t.score, 0);
      const totalScore = todos.reduce((s, t) => s + t.score, 0);
      const initials = (session.name || session.email || "?").charAt(0).toUpperCase();
      const displayName = session.name || session.email;

      const taskItem = (t, done) => `
        <div class="profile-task-item" style="${done ? 'opacity:.55;' : ''}">
          <span class="profile-task-name" style="${done ? 'text-decoration:line-through;' : ''}">${t.task_name}</span>
          <span class="profile-task-score">+${t.score}점</span>
        </div>
      `;

      profileContent.innerHTML = `
        <div class="profile-user-info">
          <div class="profile-avatar-large">${initials}</div>
          <div>
            <p class="profile-display-name">${displayName}</p>
            <p class="profile-email">${session.email || ""}</p>
          </div>
        </div>

        <div class="profile-stats-row">
          <div class="profile-stat-box">
            <span class="profile-stat-num">${completedScore}</span>
            <span class="profile-stat-label">획득 점수</span>
          </div>
          <div class="profile-stat-box">
            <span class="profile-stat-num">${completed.length}</span>
            <span class="profile-stat-label">완료 과제</span>
          </div>
          <div class="profile-stat-box">
            <span class="profile-stat-num">${todos.length}</span>
            <span class="profile-stat-label">전체 과제</span>
          </div>
        </div>

        ${completed.length > 0 ? `
          <p class="profile-section-title">✅ 완료한 과제 (${completed.length})</p>
          ${completed.map(t => taskItem(t, true)).join("")}
        ` : ""}

        ${pending.length > 0 ? `
          <p class="profile-section-title">⏳ 진행 중인 과제 (${pending.length})</p>
          ${pending.map(t => taskItem(t, false)).join("")}
        ` : ""}

        ${todos.length === 0 ? `<p class="muted" style="margin-top:1rem; text-align:center;">아직 등록된 과제가 없습니다.</p>` : ""}
      `;
    } catch (error) {
      console.error("프로필 데이터 로드 실패:", error);
      profileContent.innerHTML = `<p class="muted">데이터를 불러올 수 없습니다.</p>`;
    }
  };

  const openProfileDrawer = () => {
    closeAllDrawers();
    profileDrawer?.classList.add("open");
    drawerOverlay?.classList.add("active");
    profileDrawer?.setAttribute("aria-hidden", "false");
    document.querySelector("[data-profile-toggle]")?.setAttribute("aria-expanded", "true");
    renderProfileContent();
    profileDrawerClose?.focus();
  };

  profileDrawerClose?.addEventListener("click", closeAllDrawers);

  // ---------------------------------------------------------
  // [할 일 폼 제출]
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
      submitBtn.style.cssText += "opacity:.7; cursor:not-allowed;";

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

  loadTodos();
  loadRankings();

  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const file = normalizePath(href).split("/").pop();
    if (file && file === currentFile) link.classList.add("active");
  });
})();
