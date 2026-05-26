import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# .env 파일의 환경 변수들을 불러옵니다.
load_dotenv()

# 1. 데이터베이스 주소 설정
# .env 파일에 DATABASE_URL이 있으면 그것을 쓰고, 없으면 기존처럼 로컬 todo.db를 사용합니다.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./todo.db")

# 🚨 [핵심 호환성 패치] 
# Render에서 발급하는 주소는 'postgres://'로 시작하지만, 
# 최신 SQLAlchemy는 보안 표준에 따라 'postgresql://'을 요구하므로 자동으로 변환해 줍니다.
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 2. 엔진(Engine) 생성
# DB 종류(SQLite vs PostgreSQL)에 따라 연결 옵션을 동적으로 분기 처리합니다.
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False} # SQLite 전용 필수 옵션
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL) # PostgreSQL 등 클라우드 DB용

# 3. 세션(Session) 공장 생성
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. 베이스(Base) 클래스
Base = declarative_base()

