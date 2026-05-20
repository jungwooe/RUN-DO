from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. 데이터베이스 주소 설정 (현재 폴더에 todo.db 파일로 저장)
SQLALCHEMY_DATABASE_URL = "sqlite:///./todo.db"

# 2. 엔진(Engine) 생성: 파이썬과 DB 사이의 핵심 통신선
engine = create_engine( # 여기는 나중에 배포하면 PostgreSQL로 변경할거임
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False} # SQLite 전용 필수 옵션
)

# 3. 세션(Session) 공장 생성: 실제 데이터를 주고받을 때 사용할 창구
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# autocommit=False <- 데이터 하나하나 무조건 저장이 아니고 여러 데이터 임시로 담아뒀다가 오류 없으면 마지막에 한번에 확정 지음. DB과부하 막기 위해서

# 4. 베이스(Base) 클래스: 앞으로 만들 모든 DB 모델의 기본 뼈대
Base = declarative_base()