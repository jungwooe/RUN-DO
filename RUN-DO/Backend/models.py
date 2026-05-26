import datetime # 날짜 계산을 위해 파이썬 내장 모듈 임포트
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date
from database import Base

# 데이터베이스 테이블 설계도
class Todo(Base):
    __tablename__ = "todos" # 실제 DB에 생성될 표(Table)의 이름

    # Column: 표의 각 열(항목)을 정의
    id = Column(Integer, primary_key=True, index=True) # 고유 번호 (1, 2, 3...) index=True <- DB 최적화
    task_name = Column(String, index=True)             # 할 일 내용
    score = Column(Integer)                            # AI가 부여한 점수
    reason = Column(String)                            # AI의 추천 이유
    is_completed = Column(Boolean, default=False)      # 완료 여부 (기본값: False)
    
    # 과제가 생성된 날짜를 자동으로 기록하는 컬럼 (기본값: 오늘 날짜)
    created_at = Column(Date, default=datetime.date.today)
    
    #이 할 일의 주인이 누구인지(User 테이블의 id)를 가리킨다.
    owner_id = Column(Integer, ForeignKey("users.id"))
    

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True) # 중복 가입 방지
    nickname = Column(String)                       # 프로필 및 랭킹 표시용 닉네임 (이름)
    hashed_password = Column(String)                   # 암호화된 비밀번호 저장
    profile_image = Column(String, nullable=True)    # 아바타 이모지 문자열 저장용 열 추가
