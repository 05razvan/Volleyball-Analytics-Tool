from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, SessionLocal
from models import Base, User
from auth import hash_password
from routers import teams, players, matches, availability, analytics, auth, join_requests

Base.metadata.create_all(bind=engine)

def seed_admin():
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "admin@volleyball.app").first()
        if not existing:
            admin = User(
                email="admin@volleyball.app",
                hashed_password=hash_password("admin1234"),
                name="Admin",
                role="admin",
            )
            db.add(admin)
            db.commit()
            print("Admin account created: admin@volleyball.app / admin1234")
    finally:
        db.close()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all origins so phones work too
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    seed_admin()

app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(availability.router)
app.include_router(analytics.router)
app.include_router(join_requests.router)

@app.get("/")
def root():
    return {"message": "Volleyball app is running"}