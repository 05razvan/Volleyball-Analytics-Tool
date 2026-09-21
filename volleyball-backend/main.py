from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from database import engine, SessionLocal
from models import Base, User
from auth import hash_password
from routers import teams, players, matches, availability, analytics, auth, join_requests
import os

Base.metadata.create_all(bind=engine)

def ensure_schema_columns():
    """Add newer fields to databases created before they existed."""
    match_columns = {column["name"] for column in inspect(engine).get_columns("matches")}
    if "match_type" not in match_columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE matches ADD COLUMN match_type VARCHAR "
                "NOT NULL DEFAULT 'league'"
            ))

    player_columns = {column["name"] for column in inspect(engine).get_columns("players")}
    if "is_captain" not in player_columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE players ADD COLUMN is_captain BOOLEAN "
                "NOT NULL DEFAULT false"
            ))

ensure_schema_columns()

def seed_admin():
    admin_password = os.environ.get("ADMIN_PASSWORD")
    if not admin_password:
        print("ADMIN_PASSWORD is not set; admin bootstrap skipped")
        return
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@volleyball.app")
    db = SessionLocal()
    try:
        existing = db.query(User).filter(
            User.email == admin_email).first()
        if not existing:
            admin = User(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                name="Admin",
                role="admin",
            )
            db.add(admin)
            db.commit()
            print(f"Admin account created: {admin_email}")
        else:
            existing.hashed_password = hash_password(admin_password)
            db.commit()
            print(f"Admin password synchronized from environment: {admin_email}")
    except Exception as e:
        print(f"Admin seed error: {e}")
    finally:
        db.close()

app = FastAPI()

allowed_origins = [origin.strip() for origin in os.environ.get(
    "CORS_ORIGINS",
    "https://volleyball-analytics-tool.vercel.app,"
    "https://volleyball-analytics-tool-odh9.vercel.app,"
    "http://localhost:3000",
).split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
