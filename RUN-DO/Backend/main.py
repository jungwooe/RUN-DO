import os
from dotenv import load_dotenv
import json
import bcrypt
import jwt
from typing import List
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware # 프론트엔드와 요청 정상적으로 주고 받기 위한 import
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import func, desc # 수학 계산(sum)과 내림차순(desc) 정렬을 위한 도구
from passlib.context import CryptContext # 여기부터 로그인 검증을 위한 코드
from fastapi import HTTPException, status
from datetime import datetime, timedelta, date # 시간 및 날짜 연산을 위해

# [AI 파트] 구글의 최신 SDK 라이브러리로 변경
from google import genai
from sqlalchemy.orm import Session

# 파일 불러오기
import models
from database import engine, SessionLocal

# ============================
# 깃허브에 올리기 위한 로직들

# 1. .env 파일에 있는 내용들을 컴퓨터 메모리로 불러옵니다. 
load_dotenv()

# 2. os.getenv() 함수를 이용해 금고에서 키 값을 찾아 변수에 넣습니다.
# 만약 .env 파일에 해당 키가 없으면 에러를 띄워 서버가 켜지는 것을 막습니다.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") # 유출을 막기 위한 로직.
SECRET_KEY = os.getenv("JWT_SECRET_KEY") # 토큰을 만들고 검증하는 서버의 마스터 키

if not GEMINI_API_KEY or not SECRET_KEY:
    raise ValueError("환경 변수(.env)에 API 키 또는 SECRET_KEY가 설정되지 않았습니다.")

client = genai.Client(api_key=GEMINI_API_KEY)

# 여기까지 깃허브를 위한 로직.
# ============================

# 서버가 켜질 때 models.py의 설계도를 보고 DB 파일(todo.db)과 테이블을 자동 생성
models.Base.metadata.create_all(bind=engine)

# FastAPI 앱 인스턴스는 반드시 한 번만 생성합니다.
app = FastAPI()

# ---------------------------------------------------------
# [보안 설정] CORS (Cross-Origin Resource Sharing) 허용
# 프론트엔드에서 우리 API를 호출할 수 있게 허락해줍니다.
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실무에서는 ["http://localhost:3000"] 처럼 특정 주소만 허용한다고 함. 현재는 전부 허용("*")
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, PATCH 등 모든 통신 방식 허용
    allow_headers=["*"],  # 토큰(Bearer) 같은 헤더 정보 허용
)

# ---------------------------------------------------------
# [AI 파트] Gemini API 클라이언트 설정
# ---------------------------------------------------------
client = genai.Client(api_key=GEMINI_API_KEY) 


# ---------------------------------------------------------
# [보안 설정]
# ---------------------------------------------------------
ALGORITHM = "HS256"                # 암호화 알고리즘 종류

# HTTPBearer: 토큰을 편하게 받을 수 있게 해주는 FastAPI 도구
security = HTTPBearer()

# ---------------------------------------------------------
# DB 세션(창구)을 열고 닫는 안전한 함수 (의존성 주입용)
# ---------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db  # API 요청이 처리되는 동안 창구를 열어둠
    finally:
        db.close() # 작업이 끝나면 반드시 창구를 닫음 (메모리 누수 방지)
        
# 클라이언트에서 받을 유저 데이터 형식
class UserCreate(BaseModel):
    email: str
    nickname: str
    password: str
    
# 로그인용 데이터 뼈대
class UserLogin(BaseModel):
    email: str
    password: str

# ---------------------------------------------------------
# [핵심 함수] 비밀번호 단방향 암호화 (Hashing)
# ---------------------------------------------------------
def get_password_hash(password: str) -> str:
    # 1. 문자열 비밀번호를 바이트로 변환 (encode)
    pwd_bytes = password.encode('utf-8')
    # 2. 소금을 뿌려서 해싱한 뒤 다시 문자열로 변환 (decode)
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_password.decode('utf-8')

# ---------------------------------------------------------
# [핵심 함수] 비밀번호 검증
# ---------------------------------------------------------
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ---------------------------------------------------------
# [핵심 로직] 토큰을 해독해서 현재 유저가 누구인지 알아내는 문지기 함수
# ---------------------------------------------------------
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    # 프론트엔드가 보낸 토큰 추출
    token = credentials.credentials
    try:
        # 비밀 열쇠(SECRET_KEY)로 토큰 해독
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    except jwt.PyJWTError:
        # 토큰이 위조되었거나 만료되었을 때
        raise HTTPException(status_code=401, detail="토큰 검증에 실패했습니다. 다시 로그인해주세요.")
    
    # 해독한 username으로 DB에서 유저 정보 찾기
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다.")
    
    return user # 검증된 유저 객체를 통과시킴

# ---------------------------------------------------------
# [API] 1. 회원가입
# ---------------------------------------------------------
@app.post("/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    # 이미 존재하는 아이디인지 검사
    existing_user = db.query(models.User).filter(models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="이미 가입된 이메일 주소입니다."
        )
    
    # 비밀번호 암호화 후 DB 저장
    # 2. 비밀번호 해싱 및 새 유저 ORM 객체 생성
    # 프론트엔드에서 보낸 이메일 주소가 user.email 필드를 통해 들어옵니다.
    hashed_pwd = pwd_context.hash(user.password)
    db_user = models.User(email=user.email, nickname=user.nickname, hashed_password=hashed_pwd)
    db.add(db_user)
    db.commit() # 3. 데이터베이스 세션에 추가 후 커밋을 수행하여 물리 파일에 저장
    db.refresh(db_user)  # DB에 저장되면서 자동 생성된 데이터들을 객체에 최신화합니다.
    
    return {"status": "success", "message": "회원가입이 완료되었습니다!"}


# ---------------------------------------------------------
# 1. 보안 설정 및 검증 함수 (서버가 켜질 때 한 번만 로드되도록 상단에 배치)
# ---------------------------------------------------------
# 비밀번호 해싱 및 검증을 위한 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 사용자가 입력한 평문과 DB의 해시를 비교하는 전용 함수
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# ---------------------------------------------------------
# [API] 2. 로그인 및 JWT 토큰 발급
# ---------------------------------------------------------
@app.post("/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
        
    # JWT 토큰에 8시간의 유효기간(exp)을 만료 스탬프로 주입합니다.
    # 로그인하고 다음 날(8시간 이후) 재접속하면 자동으로 만료되어 문지기 함수가 거절합니다.
    access_token_expires = datetime.utcnow() + timedelta(hours=8)
    token_data = {"sub": db_user.email, "exp": access_token_expires}  # 만료 시간 키값 등록
    token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
    
    # 로그인 성공 시 프론트엔드에 '닉네임'을 별도로 챙겨서 보내줍니다.
    return {
        "status": "success", 
        "access_token": token, 
        "nickname": db_user.nickname,
        "email": db_user.email
    }


# ---------------------------------------------------------
# [백엔드 파트] 데이터 검증 설계도
# ---------------------------------------------------------
class TodoItem(BaseModel):
    # List[str]를 사용하여 문자열이 여러 개 담긴 배열을 정상적으로 수신합니다.
    tasks: List[str] 

@app.post("/analyze-todo")
def analyze_todo(todo: TodoItem, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)): 
    # Depends(get_db) <- FastAPI 기능으로 API 요청이 들어올 때마다 서버가 알아서 DB 문을 열어주고, 응답이 끝나면 안전하게 문을 닫아준다.
    
    # 1. 캐싱 및 분석 대상 분류
    final_results = []
    tasks_to_analyze = []

    for raw_task in todo.tasks:
        task_name = raw_task.strip()
        if not task_name:
            continue

        # 동일한 이름의 미션이 DB에 이미 존재하는지 전체 유저 기록에서 검색
        existing_task = db.query(models.Todo).filter(models.Todo.task_name == task_name).first()

        if existing_task:
            # 이미 누군가 평가받은 적이 있다면, AI를 부르지 않고 기존 점수와 이유를 100% 똑같이 복사
            # 같은 플랜 리스트에 대해 동일한 점수를 받도록 하기 위함.
            final_results.append({
                "task_name": task_name,
                "score": existing_task.score,
                "reason": existing_task.reason
            })
        else:
            # DB에 없는 완전히 새로운 미션만 AI에게 전송
            tasks_to_analyze.append(task_name)
    
    # ---------------------------------------------------------
    # [AI 파트] 프롬프트 작성 (배열 처리 로직 추가)
    # ---------------------------------------------------------
    # 2. 새로운 미션이 있을 경우에만 AI 평가 진행
    if tasks_to_analyze:
        # 프롬프트에 어뷰징 방지(0점 처리) 강력한 규칙 추가
        prompt = f"""
        너는 할 일의 난이도를 평가하는 전문가 AI야.
        사용자가 할 일 목록을 배열(List) 형태로 줄 거야. 다음 평가 기준을 엄격하게 지켜.

        1. 일반적인 학습, 업무, 운동 등 개인의 노력이 들어가는 의미 있는 과제는 난이도에 따라 1점~50점을 부여해.
        2. [매우 중요] 물 마시기, 숨쉬기, 잠자기, 밥 먹기 등 일상적인 생리 현상이나 너무 쉬운 행동은 무조건 'score'를 0점으로 처리하고, 'reason'에 "일상적이고 단순한 행동은 점수를 받을 수 없습니다."라고 적어.

        출력 형식 예시:
        [
            {{"task_name": "할일이름", "score": 점수, "reason": "이유"}}
        ]

        사용자의 할 일 목록: {tasks_to_analyze}
        """
        # ---------------------------------------------------------
        # [AI 파트] 구글 서버 통신 (네트워크 에러 방어 코드 추가)
        # ---------------------------------------------------------
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            # ---------------------------------------------------------
            # [백엔드 파트] JSON 텍스트를 파이썬 리스트/딕셔너리로 변환
            # ---------------------------------------------------------
            ai_result = json.loads(response.text)
            final_results.extend(ai_result)
        except Exception as e:
            print(f"🚨 구글 AI 통신 에러 발생: {e}")
            # 통신 에러 발생 시 서버를 다운시키지 않고, 프론트엔드에게 정중하게 에러 메시지만 전달합니다.
            raise HTTPException(status_code=503, detail="AI 서버와의 네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.")
        
    # 3. 0점(어뷰징) 필터링 및 최종 DB 저장
    saved_todos = []
    rejected_tasks = []
    
    # ---------------------------------------------------------
    # [백엔드 파트] DB에 영구 저장 로직
    # ---------------------------------------------------------
    for item in final_results:
        if item["score"] == 0:
            rejected_tasks.append(item["task_name"])
            continue # 0점짜리 미션은 DB에 저장하지 않고 버림
        
        # 1. ORM을 이용해 파이썬 객체로 데이터 조립
        db_todo = models.Todo(
            task_name=item["task_name"],
            score=item["score"],
            reason=item["reason"],
            owner_id=current_user.id # 문지기를 통과한 유저의 ID를 이름표로 붙임
        )
        # 2. 세션(창구)에 추가 (아직 저장 안 됨)
        db.add(db_todo)
        saved_todos.append(item)
    
    # 3. 추가된 모든 데이터를 한 번에 확정 저장 (Commit)
    db.commit()
    
    # 4. 프론트엔드에 전달할 맞춤형 알림 메시지 생성
    if not saved_todos and rejected_tasks:
        return {"status": "success", "message": f"등록 실패: 너무 단순한 행동은 등록할 수 없습니다. ({', '.join(rejected_tasks)})", "data": []}
    elif rejected_tasks:
        return {"status": "success", "message": f"할 일이 저장되었습니다! (제외됨: {', '.join(rejected_tasks)})", "data": saved_todos}
    else:
        return {"status": "success", "message": "할 일이 성공적으로 저장되었습니다!", "data": saved_todos}
    

# ---------------------------------------------------------
# [수정된 API] 내 할 일만 가져오도록 변경
# ---------------------------------------------------------
@app.get("/todos")
def get_all_todos(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 오늘 날짜(date.today())를 구하여 쿼리 필터 조건으로 추가합니다.
    today = date.today()
    # DB에서 '나의 owner_id'와 일치하는 데이터만 가져옴
    todos = db.query(models.Todo).filter(models.Todo.owner_id == current_user.id, models.Todo.created_at == today).all() 
    # 오늘 생성된 할 일만 조회
    return {"status": "success", "count": len(todos), "data": todos}


# ---------------------------------------------------------
# [API] 할 일 완료 상태 토글
# ---------------------------------------------------------
@app.patch("/todos/{todo_id}")
def toggle_todo_complete(todo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. DB에서 현재 로그인한 유저의 할 일 중 해당 ID를 가진 데이터만 정확히 타겟팅하여 조회합니다.
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="해당 할 일을 찾을 수 없거나 권한이 없습니다.")
        
    # 2. Boolean 상태 반전 (완료 -> 미완료, 미완료 -> 완료)
    todo.is_completed = not todo.is_completed
    
    # 3. 변경 사항을 DB에 커밋하여 확정
    db.commit()
    db.refresh(todo)
    
    return {"status": "success", "is_completed": todo.is_completed}

# ---------------------------------------------------------
# [API] 5. 할 일 삭제 (Delete)
# ---------------------------------------------------------
@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. DB에서 내 소유의 할 일인지 권한 검증 및 조회
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="해당 과제를 찾을 수 없거나 삭제 권한이 없습니다.")
        
    # 2. 데이터베이스에서 물리적 삭제 후 커밋
    db.delete(todo)
    db.commit()
    
    return {"status": "success", "message": "과제가 삭제되었습니다."}

# ---------------------------------------------------------
# 프론트엔드에서 수정할 텍스트만 받기 위함
# ---------------------------------------------------------
class TodoUpdate(BaseModel):
    task_name: str
    
# ---------------------------------------------------------
# [API] 6. 할 일 내용 수정
# ---------------------------------------------------------
@app.put("/todos/{todo_id}")
def update_todo(todo_id: int, todo_data: TodoUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. DB에서 내 소유의 할 일인지 검증
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    
    if not todo:
        raise HTTPException(status_code=404, detail="해당 과제를 찾을 수 없거나 수정 권한이 없습니다.")
        
    # 2. 할 일 내용(텍스트)만 새것으로 교체 (점수나 완료 상태는 그대로 유지)
    todo.task_name = todo_data.task_name
    
    # 3. 변경 사항 확정
    db.commit()
    
    return {"status": "success", "message": "과제 내용이 수정되었습니다."}

# ---------------------------------------------------------
# [새로운 API] 명예의 전당 (유저 랭킹 조회)
# ---------------------------------------------------------
@app.get("/rankings")
def get_rankings(db: Session = Depends(get_db)):
    """
    모든 유저의 할 일 점수를 합산하여 내림차순(높은 점수 순)으로 정렬하여 반환합니다.
    """
    # 오늘 완료된 과제의 점수만 그룹화하여 더하도록 필터를 확장합니다.
    today = date.today()
    # 데이터베이스 쿼리 (SQL 번역기)
    results = (
        db.query(
            models.User.nickname,
            func.sum(models.Todo.score).label("total_score") # 점수들을 다 더해서 total_score라고 부름
        )
        .join(models.Todo, models.User.id == models.Todo.owner_id) # User와 Todo 테이블을 하나로 합침
        .filter(models.Todo.is_completed == True, models.Todo.created_at == today) # 오늘 완료된 미션 점수만 집계하도록 함.
        .group_by(models.User.id) # 유저별로 그룹을 묶음
        .order_by(desc("total_score")) # 총점이 높은 순서대로 줄 세우기 (descending)
        .all()
    )
    
    
    # 결과를 프론트엔드가 쓰기 편하게 JSON 배열로 가공
    ranking_list = []
    for rank, r in enumerate(results, start=1):
        ranking_list.append({
            "rank": rank,
            "nickname": r.nickname,
            "total_score": r.total_score or 0
        })
        
    return {"status": "success", "data": ranking_list}
