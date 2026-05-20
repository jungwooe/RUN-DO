(() => {
  // ---------------------------------------------------------
  // [날짜 관리 기능] 현재 날짜를 'X월 Y일 Z요일' 형태로 화면에 렌더링
  // ---------------------------------------------------------
  const renderTodayDate = () => {
    const plannerDateEl = document.querySelector("#planner-today-date");
    const rankingDateEl = document.querySelector("#ranking-today-date");

    if (!plannerDateEl && !rankingDateEl) return;

    // JavaScript 표준 Intl API를 활용하여 완벽한 한국어 날짜 규격 추출
    const today = new Date();
    
    const formatter = new Intl.DateTimeFormat("ko-KR", {
      month: "long", // '5월' 형태로 추출
      day: "numeric", // '18일' 형태로 추출
      weekday: "long" // '월요일' 형태로 추출
    });

    // 결과값 예시: "5월 18일 월요일"
    const formattedDate = formatter.format(today);

    // 각각의 HTML 자리에 날짜 주입
    if (plannerDateEl) plannerDateEl.textContent = `[${formattedDate}]`;
    if (rankingDateEl) rankingDateEl.textContent = `${formattedDate} 기준`;
  };

  // 페이지가 로드될 때 날짜 표시 함수를 즉시 실행합니다.
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
  // [로그인 처리] 백엔드 설계에 맞추어 JSON 전송 방식으로 수정
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
          headers: {
            "Content-Type": "application/json", // 백엔드가 요구하는 JSON 규격으로 명시
          },
          body: JSON.stringify({
            email: email,       // 백엔드 Pydantic 모델의 키값과 일치해야 함
            password: password
          })
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem("access_token", data.access_token);
          writeSession(data.nickname, data.email); // 백엔드에서 받은 닉네임 저장
          location.href = "./planner.html";
        } else {
          // 에러 상세 내용을 문자열로 변환하여 출력
          alert("로그인 실패:\n" + (typeof data.detail === "object" ? JSON.stringify(data.detail, null, 2) : data.detail));
        }
      } catch (error) {
        console.error("백엔드 통신 실패:", error);
        alert("서버와 연결할 수 없습니다.");
      }
    });
  }

  // ---------------------------------------------------------
  // [회원가입 처리] 기존 JSON 데이터 전송 방식 유지
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
          headers: {
            "Content-Type": "application/json", // JSON 형식 명시
          },
          body: JSON.stringify({
            email: email,
            nickname: name,
            password: password
          })
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
  // [AI 플래너 기능] 조회(GET) 및 추가(POST) API 연동 정답
  // ---------------------------------------------------------
  const todoForm = document.querySelector("#todo-form");
  const todoContainer = document.querySelector("#todo-list-container");
  const emptyMessage = document.querySelector("#empty-message");

  // 헤더에 첨부할 JWT 인증 토큰 객체 생성 공통 함수
  const getAuthHeaders = () => {
    const token = localStorage.getItem("access_token");
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}` // 백엔드 보안 문지기(HTTPBearer) 규격 충족
    };
  };

  // ---------------------------------------------------------
  // [기능 1] 개별 카드 렌더링 및 완료(체크박스) 이벤트 바인딩
  // ---------------------------------------------------------
  const renderTodoCard = (todo) => {
    const card = document.createElement("div");
    card.className = "tile";
    
    // 상태에 따른 시각적 분기 처리 (완료된 카드는 회색빛 처리)
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

    // 체크박스 상태 변경 서버 전송 로직
    const checkbox = card.querySelector(".todo-checkbox");
    checkbox.addEventListener("change", async (e) => {
      const todoId = e.target.getAttribute("data-id");
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, {
          method: "PATCH",
          headers: getAuthHeaders()
        });
        
        if (response.ok) {
          loadTodos(); // DB 업데이트 성공 시 화면 전체 재렌더링하여 점수 갱신
          loadRankings();
        } else {
          alert("상태 업데이트에 실패했습니다.");
          e.target.checked = !e.target.checked; // 실패 시 체크박스 롤백
        }
      } catch (error) {
        console.error("통신 에러:", error);
        e.target.checked = !e.target.checked;
      }
    });

    // 2. 텍스트 수정(Edit) 이벤트 로직
    const editBtn = card.querySelector(".edit-btn");
    editBtn.addEventListener("click", async (e) => {
      const todoId = e.currentTarget.getAttribute("data-id");
      const currentTask = e.currentTarget.getAttribute("data-task");
      
      // 브라우저 내장 prompt를 활용하여 새 텍스트 입력받기
      const newTaskName = prompt("수정할 과제 내용을 입력하세요:", currentTask);
      
      // 취소를 누르거나 빈칸이거나 기존과 똑같으면 통신 안 함
      if (!newTaskName || newTaskName.trim() === "" || newTaskName === currentTask) return;

      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, { 
          method: "PUT", 
          headers: getAuthHeaders(),
          body: JSON.stringify({ task_name: newTaskName.trim() }) // TodoUpdate 규격에 맞게 전송
        });
        
        if (response.status === 401) { location.replace("./login.html"); return; }
        if (response.ok) { loadTodos(); } // 성공 시 화면 재렌더링
        else alert("수정에 실패했습니다.");
      } catch (error) { console.error("수정 통신 에러:", error); }
    });

    // 2. 휴지통(삭제) 이벤트
    const deleteBtn = card.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", async (e) => {
      if (!confirm("정말 이 과제를 삭제할까요?")) return;
      const todoId = e.currentTarget.getAttribute("data-id");
      try {
        const response = await fetch(`http://127.0.0.1:8000/todos/${todoId}`, { method: "DELETE", headers: getAuthHeaders() });
        if (response.ok) { loadTodos(); loadRankings(); }
        else alert("삭제에 실패했습니다.");
      } catch (error) { console.error("삭제 통신 에러:", error); }
    });

    todoContainer.appendChild(card);
  };

  // ---------------------------------------------------------
  // [기능 2] 총점 UI 업데이트 전용 함수
  // ---------------------------------------------------------
  const updateScoreUI = (completedScore, possibleScore) => {
    let scoreBadge = document.querySelector("#user-score-badge");
    
    if (!scoreBadge) {
      const headerActions = document.querySelector(".header-actions");
      if (headerActions) {
        scoreBadge = document.createElement("div");
        scoreBadge.id = "user-score-badge";
        scoreBadge.className = "badge";
        scoreBadge.style.margin = "0 1rem 0 0";
        scoreBadge.style.background = "rgba(167, 139, 250, 0.15)";
        scoreBadge.style.borderColor = "rgba(167, 139, 250, 0.3)";
        headerActions.prepend(scoreBadge); // 네비게이션 바 앞쪽에 배치
      }
    }
    
    if (scoreBadge) {
      scoreBadge.innerHTML = `🏆 진행 점수: <strong>${completedScore} 점</strong>`;
    }
    // 2. 중앙 진행도(Progress) 캐릭터 이동 로직 (동적 최대 점수 반영)
    const fill = document.querySelector("#progress-fill");
    const character = document.querySelector("#progress-character");
    const text = document.querySelector("#progress-text");

    if (fill && character && text) {
      // 방어 코드: 등록된 미션이 아예 없을 때(0점일 때) 0으로 나누어 NaN 에러가 나는 것을 방지
      const targetScore = possibleScore > 0 ? possibleScore : 100;
      
      let percentage = (completedScore / targetScore) * 100;
      if (percentage > 100) percentage = 100; // UI 레이아웃 이탈 방지 안전장치

      fill.style.width = `${percentage}%`;
      character.style.left = `calc(${percentage}% - 18px)`;
      text.textContent = `${completedScore} / ${possibleScore} 점 (목표)`;
    }
  };

  // ---------------------------------------------------------
  // [기능 3] 데이터베이스 연동 로드 및 총점 계산
  // ---------------------------------------------------------
  const loadTodos = async () => {
    if (!todoContainer) return;

    try {
      const response = await fetch("http://127.0.0.1:8000/todos", {
        method: "GET",
        headers: getAuthHeaders()
      });

      // [보안] 데이터 조회 시점에서도 401 감지 시 즉각 축출
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
        
        let totalScore = 0; // 누적 점수 보관함
        let totalPossibleScore = 0;   // 등록된 모든 미션의 총점 보관함

        result.data.forEach(todo => {
          renderTodoCard(todo);
          // 상태 불문하고 현재 유저가 등록해 둔 모든 미션의 점수를 누적하여 최대 목표치 산출
          totalPossibleScore += todo.score;

          // 데이터가 완료 상태일 경우에만 점수 합산
          if (todo.is_completed) {
            totalScore += todo.score;
          }
        });

        updateScoreUI(totalCompletedScore, totalPossibleScore); // 계산된 총점을 화면에 전달
        loadRankings();
      }
    } catch (error) {
      console.error("할 일 목록 로드 실패:", error);
    }
  };

  // ---------------------------------------------------------
  // [랭킹 기능] 백엔드 /rankings API 연동 및 실시간 화면 구현
  // ---------------------------------------------------------
  const rankingContainer = document.querySelector("#ranking-list-container");

  const loadRankings = async () => {
    if (!rankingContainer) return;

    try {
      // 랭킹 조회 API 호출 (인증 헤더 없이 누구나 조회 가능한 퍼블릭 자원)
      const response = await fetch("http://127.0.0.1:8000/rankings", {
        method: "GET"
      });
      const result = await response.json();

      if (response.ok) {
        rankingContainer.innerHTML = ""; // 기존 대기 문구 비우기

        if (!result.data || result.data.length === 0) {
          rankingContainer.innerHTML = `<p class="muted" style="margin: 0;">아직 랭킹에 등록된 유저가 없습니다.</p>`;
          return;
        }

        // 서버에서 내림차순 정렬되어 넘어온 랭킹 배열 데이터 순회
        result.data.forEach((userRank) => {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.padding = "0.75rem 1rem";
          row.style.borderRadius = "10px";
          
          // 1등 유저에게는 특별한 황금빛 배경과 테두리로 시각적 보상 부여
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

  // [기능 2] 사용자가 새로운 할 일을 입력했을 때 AI 채점 요청 및 저장
  if (todoForm) {
    todoForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const taskInput = document.querySelector("#task-input");
      const submitBtn = todoForm.querySelector('button[type="submit"]');
      const taskValue = taskInput.value.trim();
      if (!taskValue) return;

      // [UX 최적화] 통신 시작 전 버튼 비활성화 및 로딩 문구 표시 (중복 클릭 방지)
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = "⏳ AI가 난이도를 분석 중입니다...";
      submitBtn.style.opacity = "0.7";
      submitBtn.style.cursor = "not-allowed";

      try {
        // 백엔드 TodoItem 규격인 tasks: List[str] 배열 형태로 래핑하여 전송 설계
        const response = await fetch("http://127.0.0.1:8000/analyze-todo", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            tasks: [taskValue] // 단일 입력을 배열 상자에 담아 매핑
          })
        });

        const result = await response.json();

        // [보안] 토큰이 만료되었거나 조작된 경우 (401 에러) 자동 로그아웃 처리
        if (response.status === 401) {
          alert("보안을 위해 세션이 만료되었습니다. 다시 로그인해 주세요.");
          localStorage.clear();
          location.replace("./login.html");
          return;
        }

        if (response.ok) {
          if (emptyMessage) emptyMessage.style.display = "none";
          taskInput.value = ""; // 입력창 비우기
          
          // AI가 새롭게 반환한 데이터 카드 추가 렌더링
          if (result.data && result.data.length > 0) {
            result.data.forEach(newTodo => renderTodoCard(newTodo));
          }
          // 새로운 미션이 추가되었으므로 전체 데이터를 다시 로드하여 목표 점수 갱신
          loadTodos();
          alert(result.message || "AI 가 과제 점수를 성공적으로 할당했습니다!");
        } else {
          alert(result.detail || "인공지능 분석 중 오류가 발생했습니다.");
        }
      } catch (error) {
        console.error("AI 요청 실패:", error);
        alert("서버와 연결 상태가 불안정합니다.");
      } finally {
        // [안전장치] 통신이 성공하든 실패하든(에러가 나든) 무조건 원래 상태로 복구
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
      }
    });
  }

  // 플래너 페이지 진입 시 최초 1회 전체 리스트 로드 함수 실행
  // ---------------------------------------------------------
  // 페이지 진입 및 새로고침(F5) 시 
  // 내 할 일 목록과 전체 랭킹 데이터를 동시에 독립적으로 서버에 요청합니다.
  // ---------------------------------------------------------
  loadTodos();
  loadRankings();

  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const file = normalizePath(href).split("/").pop();
    if (!file) return;
    if (file === currentFile) link.classList.add("active");
  });
})();