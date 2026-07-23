from fastapi import FastAPI
from database import engine
from models import Base
from routers import teams, players, matches, availability

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(teams.router)
app.include_router(players.router)
app.include_router(matches.router)
app.include_router(availability.router)

@app.get("/")
def root():
    return {"message": "Volleyball app is running"}