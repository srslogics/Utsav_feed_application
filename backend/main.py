import hashlib
import json
import os
import re
from datetime import date
from datetime import datetime
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import DateTime
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Text
from sqlalchemy import create_engine
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import Session
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship
from sqlalchemy.orm import sessionmaker
from starlette.middleware.sessions import SessionMiddleware


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_FILE = BASE_DIR / "data.json"
DB_FILE = BASE_DIR / "utsav.sqlite3"
UPLOADS_DIR = BASE_DIR / "uploads"

UPLOADS_DIR.mkdir(exist_ok=True)


def hash_password(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_database_url() -> str:
    raw_url = os.getenv("DATABASE_URL", "").strip()
    if not raw_url:
        return f"sqlite:///{DB_FILE}"
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


DATABASE_URL = normalize_database_url()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(64))
    cluster: Mapped[str | None] = mapped_column(String(120), nullable=True)
    farm_name: Mapped[str | None] = mapped_column(String(140), nullable=True)
    farmer_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    active_batch: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bird_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    field_officer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    farm_capacity: Mapped[str | None] = mapped_column(String(80), nullable=True)
    active_sheds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DailyEntry(Base):
    __tablename__ = "daily_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    shed: Mapped[str] = mapped_column(String(40))
    opening_birds: Mapped[int] = mapped_column(Integer)
    mortality: Mapped[int] = mapped_column(Integer)
    culls: Mapped[int] = mapped_column(Integer)
    feed_used_bags: Mapped[int] = mapped_column(Integer)
    water_liters: Mapped[int] = mapped_column(Integer)
    avg_weight_g: Mapped[int] = mapped_column(Integer)
    temperature_c: Mapped[float] = mapped_column(Float)
    humidity_pct: Mapped[int] = mapped_column(Integer)
    litter_condition: Mapped[str] = mapped_column(String(40))
    power_cut_hours: Mapped[float] = mapped_column(Float)
    dg_hours: Mapped[float] = mapped_column(Float)
    uniformity_pct: Mapped[int] = mapped_column(Integer)
    issues: Mapped[str] = mapped_column(Text, default="")
    remarks: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FeedStock(Base):
    __tablename__ = "feed_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    shed: Mapped[str] = mapped_column(String(40))
    feed_type: Mapped[str] = mapped_column(String(40))
    bags: Mapped[int] = mapped_column(Integer)


class FeedInward(Base):
    __tablename__ = "feed_inward"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    inward_date: Mapped[str] = mapped_column(String(20), index=True)
    feed_type: Mapped[str] = mapped_column(String(40))
    bags: Mapped[int] = mapped_column(Integer)
    shed: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MortalityLog(Base):
    __tablename__ = "mortality_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    shed: Mapped[str] = mapped_column(String(40))
    birds: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MedicineStock(Base):
    __tablename__ = "medicine_stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MedicineLog(Base):
    __tablename__ = "medicine_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VaccinationLog(Base):
    __tablename__ = "vaccination_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    shed: Mapped[str] = mapped_column(String(40))
    vaccine: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(40))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SupportRequest(Base):
    __tablename__ = "support_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    request_type: Mapped[str] = mapped_column(String(120))
    priority: Mapped[str] = mapped_column(String(20))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentUpload(Base):
    __tablename__ = "document_uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    doc_type: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(200))
    amount: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    file_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class IssuePhoto(Base):
    __tablename__ = "issue_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    issue_type: Mapped[str] = mapped_column(String(120))
    shed: Mapped[str] = mapped_column(String(40))
    priority: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str] = mapped_column(Text, default="")
    file_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FieldVisit(Base):
    __tablename__ = "field_visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    officer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    visit_date: Mapped[str] = mapped_column(String(20), index=True)
    shed: Mapped[str] = mapped_column(String(40))
    avg_weight_g: Mapped[int] = mapped_column(Integer)
    mortality: Mapped[int] = mapped_column(Integer)
    feed_stock_note: Mapped[str] = mapped_column(Text, default="")
    medicine_note: Mapped[str] = mapped_column(Text, default="")
    issue_summary: Mapped[str] = mapped_column(Text, default="")
    action_taken: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


engine = create_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

app = FastAPI(title="Utsav Operations API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "utsav-dev-session-secret"),
    same_site="lax",
    https_only=False,
)

WEBSITE_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/website.html": "website.html",
    "/website-about.html": "website-about.html",
    "/website-farmers.html": "website-farmers.html",
    "/website-contact.html": "website-contact.html",
    "/website-platform.html": "website-platform.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
    "/downloads/UtsavFarmerLite-debug.apk": "UtsavFarmerLite-debug.apk",
}

FARMER_APP_PUBLIC = {"index.html", "styles.css", "app.js"}
FIELD_APP_PUBLIC = {"index.html", "styles.css", "app.js"}


class LoginPayload(BaseModel):
    phone: str
    password: str
    role: str


class FeedBalancePayload(BaseModel):
    shed: str
    feed_type: str
    bags: int = Field(ge=0)


class FeedInwardPayload(BaseModel):
    inward_date: str
    feed_type: str
    bags: int = Field(gt=0)
    shed: str


class MedicinePayload(BaseModel):
    name: str
    status: str
    quantity: str
    notes: str = ""
    entry_date: str | None = None


class RequestPayload(BaseModel):
    type: str
    priority: str
    details: str


class DailyEntryPayload(BaseModel):
    entry_date: str
    shed: str
    opening_birds: int = Field(gt=0)
    mortality: int = Field(ge=0)
    culls: int = Field(ge=0)
    feed_used_bags: int = Field(ge=0)
    water_liters: int = Field(ge=0)
    avg_weight_g: int = Field(gt=0)
    temperature_c: float
    humidity_pct: int = Field(ge=0, le=100)
    litter_condition: str
    power_cut_hours: float = Field(ge=0)
    dg_hours: float = Field(ge=0)
    uniformity_pct: int = Field(ge=0, le=100)
    issues: str = ""
    remarks: str = ""


class FieldVisitPayload(BaseModel):
    farmer_code: str
    visit_date: str
    shed: str
    avg_weight_g: int = Field(gt=0)
    mortality: int = Field(ge=0)
    feed_stock_note: str = ""
    medicine_note: str = ""
    issue_summary: str = ""
    action_taken: str = ""


def safe_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return cleaned or "document"


def today_string() -> str:
    return str(date.today())


def session_scope() -> Session:
    return SessionLocal()


def serialize_profile(user: User) -> dict:
    return {
        "id": user.id,
        "role": user.role,
        "farmer_name": user.name,
        "name": user.name,
        "cluster": user.cluster or "",
        "farm_name": user.farm_name or "",
        "farmer_code": user.farmer_code or "",
        "phone": user.phone,
        "active_batch": user.active_batch or "",
        "bird_age_days": user.bird_age_days or 0,
        "field_officer": user.field_officer or "",
        "farm_capacity": user.farm_capacity or "",
        "active_sheds": user.active_sheds or 0,
        "title": user.title or "",
    }


def get_current_user(request: Request, role: str | None = None) -> User:
    user_id = request.session.get("user_id")
    user_role = request.session.get("role")
    if not user_id or not user_role:
        raise HTTPException(status_code=401, detail="Login required.")
    if role and user_role != role:
        raise HTTPException(status_code=403, detail="Access denied.")

    with session_scope() as db:
        user = db.get(User, int(user_id))
        if not user:
            request.session.clear()
            raise HTTPException(status_code=401, detail="Session expired.")
        if role and user.role != role:
            raise HTTPException(status_code=403, detail="Access denied.")
        return user


def get_farmer_by_code(db: Session, farmer_code: str) -> User:
    farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == farmer_code))
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found.")
    return farmer


def latest_entries_by_shed(entries: list[DailyEntry]) -> dict[str, DailyEntry]:
    result: dict[str, DailyEntry] = {}
    for entry in entries:
        if entry.shed not in result:
            result[entry.shed] = entry
    return result


def make_feed_balances(records: list[FeedStock]) -> list[dict]:
    totals: dict[str, int] = {}
    type_map: dict[str, list[str]] = {}
    for record in records:
        totals[record.shed] = totals.get(record.shed, 0) + int(record.bags)
        type_map.setdefault(record.shed, []).append(f"{record.feed_type}: {record.bags}")

    items = [
        {"label": shed, "value": f"{totals[shed]} bags", "note": " / ".join(type_map[shed])}
        for shed in sorted(totals)
    ]
    items.append(
        {
            "label": "Total farm",
            "value": f"{sum(totals.values())} bags",
            "note": "Current available stock across sheds",
        }
    )
    return items


def make_feed_history(records: list[FeedInward]) -> list[dict]:
    return [
        {
            "label": f"{record.inward_date} / {record.feed_type} / {record.shed}",
            "value": f"{record.bags} bags",
        }
        for record in records
    ]


def make_medicine_summary(records: list[MedicineStock]) -> list[dict]:
    return [
        {
            "label": record.status,
            "value": record.name,
            "note": f"{record.quantity} • {record.notes}",
        }
        for record in records[:6]
    ]


def make_medicine_log(records: list[MedicineLog]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.name}",
            "value": f"{record.status} • {record.quantity}",
            "note": record.notes,
        }
        for record in records
    ]


def make_request_history(records: list[SupportRequest]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.request_type}",
            "value": f"{record.status} • {record.priority}",
            "note": record.details,
        }
        for record in records
    ]


def make_daily_entry_history(records: list[DailyEntry]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.shed}",
            "value": f"{record.mortality} mortality • {record.feed_used_bags} feed bags",
            "note": f"Water {record.water_liters} L • Avg wt {record.avg_weight_g} g • Temp {record.temperature_c} C",
        }
        for record in records
    ]


def make_vaccine_history(records: list[VaccinationLog]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.shed} / {record.vaccine}",
            "value": record.status,
            "note": record.notes,
        }
        for record in records
    ]


def make_document_history(records: list[DocumentUpload]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.doc_type}",
            "value": record.status,
            "note": f"{record.title} • {record.amount or 'No amount'} • File: {record.file_name}",
        }
        for record in records
    ]


def make_issue_photo_history(records: list[IssuePhoto]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.issue_type} / {record.shed}",
            "value": record.status,
            "note": f"{record.priority} priority • {record.notes} • File: {record.file_name}",
        }
        for record in records
    ]


def build_owner_alerts(entries: list[DailyEntry], requests: list[SupportRequest], vaccines: list[VaccinationLog]) -> list[dict]:
    alerts: list[dict] = []
    for record in entries[:4]:
        if record.mortality >= 15:
            alerts.append({"label": f"{record.shed} mortality watch", "value": f"{record.mortality} birds", "note": f"{record.entry_date} entry needs review"})
        if record.temperature_c >= 31:
            alerts.append({"label": f"{record.shed} temperature high", "value": f"{record.temperature_c} C", "note": "Ventilation and cooling check advised"})
        if record.power_cut_hours >= 2:
            alerts.append({"label": f"{record.shed} power interruption", "value": f"{record.power_cut_hours} hrs", "note": "Monitor DG usage and bird stress"})

    for request in requests[:3]:
        if request.status != "Closed":
            alerts.append({"label": request.request_type, "value": request.status, "note": request.details})

    for vaccine in vaccines[:3]:
        if vaccine.status == "Due":
            alerts.append({"label": f"Vaccine due in {vaccine.shed}", "value": vaccine.vaccine, "note": vaccine.entry_date})
    return alerts[:6]


def build_performance_metrics(entries: list[DailyEntry]) -> list[dict]:
    if not entries:
        return []
    by_shed = latest_entries_by_shed(entries)
    total_feed_bags = sum(float(item.feed_used_bags) for item in entries)
    total_feed_kg = total_feed_bags * 50
    placement_birds = sum(float(item.opening_birds) for item in by_shed.values())
    current_live_birds = sum(float(item.opening_birds) - float(item.mortality) - float(item.culls) for item in by_shed.values())
    total_mortality = sum(float(item.mortality) for item in entries)
    total_culls = sum(float(item.culls) for item in entries)
    weighted_live_weight_kg = sum((((float(item.opening_birds) - float(item.mortality) - float(item.culls)) * float(item.avg_weight_g)) / 1000) for item in by_shed.values())
    avg_weight_g = sum(float(item.avg_weight_g) for item in by_shed.values()) / len(by_shed)
    livability = ((current_live_birds / placement_birds) * 100) if placement_birds else 0
    running_fcr = (total_feed_kg / weighted_live_weight_kg) if weighted_live_weight_kg else 0
    feed_per_bird_kg = (total_feed_kg / current_live_birds) if current_live_birds else 0
    return [
        {"label": "Running FCR", "value": f"{running_fcr:.2f}", "note": "Estimated from submitted cycle feed and current live weight"},
        {"label": "Livability", "value": f"{livability:.1f}%", "note": f"{int(current_live_birds):,} live birds from {int(placement_birds):,} placed"},
        {"label": "Feed consumed", "value": f"{total_feed_kg:,.0f} kg", "note": f"{total_feed_bags:,.0f} total bags recorded in cycle"},
        {"label": "Current live weight", "value": f"{weighted_live_weight_kg:,.0f} kg", "note": f"Average body weight {avg_weight_g:,.0f} g"},
        {"label": "Feed per bird", "value": f"{feed_per_bird_kg:.2f} kg", "note": f"Mortality {int(total_mortality):,} • culls {int(total_culls):,}"},
    ]


def current_cycle_entries(db: Session, farmer_id: int) -> list[DailyEntry]:
    return list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id == farmer_id).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())))


def latest_date_entries(entries: list[DailyEntry]) -> list[DailyEntry]:
    if not entries:
        return []
    latest_date = entries[0].entry_date
    return [item for item in entries if item.entry_date == latest_date]


def seed_database_from_json() -> None:
    with session_scope() as db:
        existing = db.scalar(select(func.count(User.id)))
        if existing:
            return

        seed_data = json.loads(DATA_FILE.read_text()) if DATA_FILE.exists() else {}
        profile = seed_data.get("profile", {})
        farmer = User(
            role="farmer",
            name=profile.get("farmer_name", "Rakesh Verma"),
            phone=profile.get("phone", "+91 9876543210"),
            password_hash=hash_password(os.getenv("FARMER_APP_DEFAULT_PASSWORD", "utsav123")),
            cluster=profile.get("cluster", "Korba Cluster"),
            farm_name=profile.get("farm_name", "Utsav Partner Farm 12"),
            farmer_code=profile.get("farmer_code", "UF-042"),
            active_batch=profile.get("active_batch", "B-2405"),
            bird_age_days=profile.get("bird_age_days", 24),
            field_officer=profile.get("field_officer", "Anil Sahu"),
            farm_capacity=profile.get("farm_capacity", "32,000 birds"),
            active_sheds=profile.get("active_sheds", 2),
        )
        officer = User(
            role="field",
            name=profile.get("field_officer", "Anil Sahu"),
            phone=os.getenv("FIELD_APP_DEFAULT_PHONE", "+91 9898989898"),
            password_hash=hash_password(os.getenv("FIELD_APP_DEFAULT_PASSWORD", "field123")),
            cluster=profile.get("cluster", "Korba Cluster"),
            title="Field Officer",
        )
        db.add_all([farmer, officer])
        db.flush()

        for item in seed_data.get("daily_entries", []):
            db.add(DailyEntry(farmer_id=farmer.id, entry_date=item["date"], shed=item["shed"], opening_birds=item["opening_birds"], mortality=item["mortality"], culls=item["culls"], feed_used_bags=item["feed_used_bags"], water_liters=item["water_liters"], avg_weight_g=item["avg_weight_g"], temperature_c=item["temperature_c"], humidity_pct=item["humidity_pct"], litter_condition=item["litter_condition"], power_cut_hours=item["power_cut_hours"], dg_hours=item["dg_hours"], uniformity_pct=item["uniformity_pct"], issues=item.get("issues", ""), remarks=item.get("remarks", "")))
        for item in seed_data.get("feed_stock", []):
            db.add(FeedStock(farmer_id=farmer.id, shed=item["shed"], feed_type=item["feed_type"], bags=item["bags"]))
        for item in seed_data.get("feed_inward", []):
            db.add(FeedInward(farmer_id=farmer.id, inward_date=item["date"], feed_type=item["feed_type"], bags=item["bags"], shed=item["shed"]))
        for item in seed_data.get("mortality_log", []):
            db.add(MortalityLog(farmer_id=farmer.id, entry_date=item["date"], shed=item["shed"], birds=item["birds"], notes=item.get("notes", "")))
        for item in seed_data.get("medicine_stock", []):
            db.add(MedicineStock(farmer_id=farmer.id, name=item["name"], status=item["status"], quantity=item["quantity"], notes=item.get("notes", "")))
        for item in seed_data.get("medicine_log", []):
            db.add(MedicineLog(farmer_id=farmer.id, entry_date=item["date"], name=item["name"], status=item["status"], quantity=item["quantity"], notes=item.get("notes", "")))
        for item in seed_data.get("vaccination_log", []):
            db.add(VaccinationLog(farmer_id=farmer.id, entry_date=item["date"], shed=item["shed"], vaccine=item["vaccine"], status=item["status"], notes=item.get("notes", "")))
        for item in seed_data.get("requests", []):
            db.add(SupportRequest(farmer_id=farmer.id, entry_date=item["date"], request_type=item["type"], priority=item["priority"], details=item["details"], status=item["status"]))
        for item in seed_data.get("documents", []):
            db.add(DocumentUpload(farmer_id=farmer.id, entry_date=item["date"], doc_type=item["type"], title=item["title"], amount=item.get("amount", ""), notes=item.get("notes", ""), file_name=item["file_name"], stored_name=item.get("stored_name", ""), status=item["status"]))
        for item in seed_data.get("issue_photos", []):
            db.add(IssuePhoto(farmer_id=farmer.id, entry_date=item["date"], issue_type=item["issue_type"], shed=item["shed"], priority=item["priority"], notes=item.get("notes", ""), file_name=item["file_name"], stored_name=item.get("stored_name", ""), status=item["status"]))

        db.add(
            FieldVisit(
                officer_id=officer.id,
                farmer_id=farmer.id,
                visit_date="2026-05-16",
                shed="Shed B",
                avg_weight_g=1390,
                mortality=11,
                feed_stock_note="Starter 14 bags visible, finisher 30 bags stacked.",
                medicine_note="Respiratory support requested, vitamin stock available.",
                issue_summary="Rear nipple line pressure low near back row.",
                action_taken="Line flushed, farmer advised to monitor till evening.",
            )
        )
        db.commit()


def init_database() -> None:
    Base.metadata.create_all(engine)
    seed_database_from_json()


def public_file_response(file_name: str) -> FileResponse:
    file_path = PROJECT_ROOT / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path)


def app_file_response(app_dir: str, file_name: str) -> FileResponse:
    file_path = PROJECT_ROOT / app_dir / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path)


for route_path, file_name in WEBSITE_FILES.items():
    app.add_api_route(route_path, lambda file_name=file_name: public_file_response(file_name), methods=["GET"])


@app.on_event("startup")
def on_startup() -> None:
    init_database()


@app.get("/api/health")
def healthcheck():
    return {
        "status": "ok",
        "database": DATABASE_URL.split("://", 1)[0],
    }


@app.post("/api/auth/login")
def auth_login(payload: LoginPayload, request: Request):
    with session_scope() as db:
        user = db.scalar(select(User).where(User.phone == payload.phone, User.role == payload.role))
        if not user or user.password_hash != hash_password(payload.password):
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        request.session["user_id"] = user.id
        request.session["role"] = user.role
        request.session["name"] = user.name
        return {
            "success": True,
            "role": user.role,
            "user": serialize_profile(user),
            "redirect": "/farmer-app/dashboard.html" if user.role == "farmer" else "/field-app/dashboard.html",
        }


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    request.session.clear()
    return {"success": True}


@app.get("/api/auth/session")
def auth_session(request: Request):
    user_id = request.session.get("user_id")
    role = request.session.get("role")
    if not user_id or not role:
        raise HTTPException(status_code=401, detail="No active session.")
    with session_scope() as db:
        user = db.get(User, int(user_id))
        if not user:
            request.session.clear()
            raise HTTPException(status_code=401, detail="Session expired.")
        return {"authenticated": True, "role": user.role, "user": serialize_profile(user)}


@app.get("/api/farmer/profile")
def farmer_profile(request: Request):
    user = get_current_user(request, "farmer")
    return serialize_profile(user)


@app.get("/api/farmer/dashboard")
def farmer_dashboard(request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        entries = current_cycle_entries(db, user.id)
        current_entries = latest_date_entries(entries)
        requests = list(db.scalars(select(SupportRequest).where(SupportRequest.farmer_id == user.id).order_by(SupportRequest.created_at.desc())))
        vaccines = list(db.scalars(select(VaccinationLog).where(VaccinationLog.farmer_id == user.id).order_by(VaccinationLog.entry_date.desc(), VaccinationLog.created_at.desc())))
        feed_stock = list(db.scalars(select(FeedStock).where(FeedStock.farmer_id == user.id)))

    mortality_today = sum(item.mortality for item in current_entries)
    total_feed = sum(item.bags for item in feed_stock)
    open_requests = sum(1 for item in requests if item.status != "Closed")
    current_birds = sum(item.opening_birds - item.mortality - item.culls for item in current_entries)
    latest_entry = entries[0] if entries else None

    return {
        "profile": serialize_profile(user),
        "kpis": [
            {"label": "Bird age | Bird age", "value": f"{user.bird_age_days or 0} days", "note": "Active batch age"},
            {"label": "Live birds | Live birds", "value": f"{current_birds:,}", "note": "Latest submitted day"},
            {"label": "Mortality | Mortality", "value": f"{mortality_today} birds", "note": "Latest submitted day"},
            {"label": "Feed balance | Feed stock", "value": f"{total_feed} bags", "note": "Current stock on farm"},
            {"label": "Open requests | Pending requests", "value": str(open_requests), "note": "Pending operations support"},
        ],
        "batch_summary": [
            {"label": "Batch", "value": user.active_batch or "-", "note": "Current cycle"},
            {"label": "Farm", "value": user.farm_name or "-", "note": user.farmer_code or ""},
            {"label": "Capacity", "value": user.farm_capacity or "-", "note": f"{user.active_sheds or 0} active sheds"},
            {"label": "Field officer", "value": user.field_officer or "-", "note": "Assigned support"},
        ],
        "tasks": [
            {"label": "Aaj ki entry", "value": "Birds, feed, paani aur environment data submit karein"},
            {"label": "Feed inward", "value": "Unload hone ke baad inward save karein"},
            {"label": "Dawai note", "value": "Birds ko di gayi dawai ka record rakhein"},
            {"label": "Photo / bill upload", "value": "Issue ya bill turant owner tak bhejein"},
        ],
        "mortality_history": [
            {"label": f"{item.entry_date} / {item.shed}", "value": f"{item.birds} birds", "note": item.notes or "No note added"}
            for item in db_query(lambda db: list(db.scalars(select(MortalityLog).where(MortalityLog.farmer_id == user.id).order_by(MortalityLog.entry_date.desc(), MortalityLog.created_at.desc()).limit(5))))
        ],
        "owner_alerts": build_owner_alerts(entries, requests, vaccines),
        "performance_metrics": build_performance_metrics(entries),
        "latest_daily_entry": (
            [
                {"label": "Date", "value": latest_entry.entry_date, "note": "Latest submission"},
                {"label": "Shed", "value": latest_entry.shed, "note": "Most recent entry shed"},
                {"label": "Feed used", "value": f"{latest_entry.feed_used_bags} bags", "note": "Daily feed consumption"},
                {"label": "Water", "value": f"{latest_entry.water_liters} L", "note": "Daily water intake"},
                {"label": "Avg weight", "value": f"{latest_entry.avg_weight_g} g", "note": "Current body weight"},
                {"label": "Litter", "value": latest_entry.litter_condition, "note": latest_entry.issues or "No issue"},
            ]
            if latest_entry
            else []
        ),
    }


def db_query(factory: Callable[[Session], list[dict] | list]) -> list:
    with session_scope() as db:
        return factory(db)


@app.get("/api/farmer/daily-entry")
def farmer_daily_entry(request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        entries = current_cycle_entries(db, user.id)
        vaccines = list(db.scalars(select(VaccinationLog).where(VaccinationLog.farmer_id == user.id).order_by(VaccinationLog.entry_date.desc(), VaccinationLog.created_at.desc())))
    return {
        "profile": serialize_profile(user),
        "entry_history": make_daily_entry_history(entries),
        "vaccine_history": make_vaccine_history(vaccines),
    }


@app.post("/api/farmer/daily-entry")
def add_daily_entry(payload: DailyEntryPayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        record = DailyEntry(
            farmer_id=user.id,
            entry_date=payload.entry_date,
            shed=payload.shed,
            opening_birds=payload.opening_birds,
            mortality=payload.mortality,
            culls=payload.culls,
            feed_used_bags=payload.feed_used_bags,
            water_liters=payload.water_liters,
            avg_weight_g=payload.avg_weight_g,
            temperature_c=payload.temperature_c,
            humidity_pct=payload.humidity_pct,
            litter_condition=payload.litter_condition,
            power_cut_hours=payload.power_cut_hours,
            dg_hours=payload.dg_hours,
            uniformity_pct=payload.uniformity_pct,
            issues=payload.issues,
            remarks=payload.remarks,
        )
        db.add(record)
        db.add(MortalityLog(farmer_id=user.id, entry_date=payload.entry_date, shed=payload.shed, birds=payload.mortality, notes=payload.issues or "Daily entry"))
        db.commit()
        db.refresh(record)
    return {"success": True, "record": {"id": record.id}}


@app.get("/api/farmer/feed")
def farmer_feed(request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        stock = list(db.scalars(select(FeedStock).where(FeedStock.farmer_id == user.id)))
        inward = list(db.scalars(select(FeedInward).where(FeedInward.farmer_id == user.id).order_by(FeedInward.inward_date.desc(), FeedInward.created_at.desc())))
    return {"profile": serialize_profile(user), "shed_balances": make_feed_balances(stock), "inward_history": make_feed_history(inward)}


@app.post("/api/farmer/feed/balance")
def update_feed_balance(payload: FeedBalancePayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        record = db.scalar(select(FeedStock).where(FeedStock.farmer_id == user.id, FeedStock.shed == payload.shed, FeedStock.feed_type == payload.feed_type))
        if record:
            record.bags = payload.bags
        else:
            db.add(FeedStock(farmer_id=user.id, shed=payload.shed, feed_type=payload.feed_type, bags=payload.bags))
        db.commit()
    return {"success": True}


@app.post("/api/farmer/feed/inward")
def add_feed_inward(payload: FeedInwardPayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        db.add(FeedInward(farmer_id=user.id, inward_date=payload.inward_date, feed_type=payload.feed_type, bags=payload.bags, shed=payload.shed))
        db.commit()
    return {"success": True}


@app.get("/api/farmer/health")
def farmer_health(request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        summary = list(db.scalars(select(MedicineStock).where(MedicineStock.farmer_id == user.id).order_by(MedicineStock.created_at.desc())))
        log = list(db.scalars(select(MedicineLog).where(MedicineLog.farmer_id == user.id).order_by(MedicineLog.entry_date.desc(), MedicineLog.created_at.desc())))
        vaccines = list(db.scalars(select(VaccinationLog).where(VaccinationLog.farmer_id == user.id).order_by(VaccinationLog.entry_date.desc(), VaccinationLog.created_at.desc())))
    return {"profile": serialize_profile(user), "summary": make_medicine_summary(summary), "log": make_medicine_log(log), "vaccines": make_vaccine_history(vaccines)}


@app.post("/api/farmer/health/stock")
def update_medicine_stock(payload: MedicinePayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        db.add(MedicineStock(farmer_id=user.id, name=payload.name, status=payload.status, quantity=payload.quantity, notes=payload.notes))
        db.commit()
    return {"success": True}


@app.post("/api/farmer/health/administer")
def add_medicine_log(payload: MedicinePayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        db.add(MedicineLog(farmer_id=user.id, entry_date=payload.entry_date or today_string(), name=payload.name, status=payload.status, quantity=payload.quantity, notes=payload.notes))
        db.commit()
    return {"success": True}


@app.get("/api/farmer/requests")
def farmer_requests(request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        requests = list(db.scalars(select(SupportRequest).where(SupportRequest.farmer_id == user.id).order_by(SupportRequest.created_at.desc())))
        documents = list(db.scalars(select(DocumentUpload).where(DocumentUpload.farmer_id == user.id).order_by(DocumentUpload.created_at.desc())))
        issue_photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id == user.id).order_by(IssuePhoto.created_at.desc())))
    return {"profile": serialize_profile(user), "history": make_request_history(requests), "documents": make_document_history(documents), "issue_photos": make_issue_photo_history(issue_photos)}


@app.post("/api/farmer/requests")
def add_request(payload: RequestPayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        db.add(SupportRequest(farmer_id=user.id, entry_date=today_string(), request_type=payload.type, priority=payload.priority, details=payload.details, status="Submitted"))
        db.commit()
    return {"success": True}


@app.post("/api/farmer/documents")
async def upload_document(
    request: Request,
    doc_type: str = Form(...),
    title: str = Form(...),
    amount: str = Form(""),
    notes: str = Form(""),
    file: UploadFile = File(...),
):
    user = get_current_user(request, "farmer")
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    original_name = file.filename or "document"
    suffix = Path(original_name).suffix or ".bin"
    stored_name = f"{timestamp}-{safe_slug(title)}{suffix}"
    destination = UPLOADS_DIR / stored_name
    destination.write_bytes(await file.read())
    with session_scope() as db:
        db.add(DocumentUpload(farmer_id=user.id, entry_date=today_string(), doc_type=doc_type, title=title, amount=amount, notes=notes, file_name=original_name, stored_name=stored_name, status="Submitted to owner system"))
        db.commit()
    return {"success": True}


@app.post("/api/farmer/issues/photo")
async def upload_issue_photo(
    request: Request,
    issue_type: str = Form(...),
    shed: str = Form(...),
    priority: str = Form(...),
    notes: str = Form(""),
    file: UploadFile = File(...),
):
    user = get_current_user(request, "farmer")
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    original_name = file.filename or "issue-photo"
    suffix = Path(original_name).suffix or ".bin"
    stored_name = f"{timestamp}-{safe_slug(issue_type)}{suffix}"
    destination = UPLOADS_DIR / stored_name
    destination.write_bytes(await file.read())
    with session_scope() as db:
        db.add(IssuePhoto(farmer_id=user.id, entry_date=today_string(), issue_type=issue_type, shed=shed, priority=priority, notes=notes, file_name=original_name, stored_name=stored_name, status="Shared with owner system"))
        db.commit()
    return {"success": True}


@app.get("/api/field/profile")
def field_profile(request: Request):
    user = get_current_user(request, "field")
    return serialize_profile(user)


@app.get("/api/field/dashboard")
def field_dashboard(request: Request):
    user = get_current_user(request, "field")
    with session_scope() as db:
        farms = list(db.scalars(select(User).where(User.role == "farmer", User.field_officer == user.name).order_by(User.farm_name)))
        farm_ids = [farm.id for farm in farms]
        daily_entries = list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id.in_(farm_ids)).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc()))) if farm_ids else []
        support_requests = list(db.scalars(select(SupportRequest).where(SupportRequest.farmer_id.in_(farm_ids)).order_by(SupportRequest.created_at.desc()))) if farm_ids else []
        issue_photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id.in_(farm_ids)).order_by(IssuePhoto.created_at.desc()))) if farm_ids else []
        visits = list(db.scalars(select(FieldVisit).where(FieldVisit.officer_id == user.id).order_by(FieldVisit.visit_date.desc(), FieldVisit.created_at.desc())))
    open_issues = sum(1 for item in support_requests if item.status != "Closed") + len([x for x in issue_photos[:5]])
    high_mortality = len([x for x in daily_entries[:8] if x.mortality >= 15])
    return {
        "profile": serialize_profile(user),
        "kpis": [
            {"label": "Assigned farms", "value": str(len(farms)), "note": "Current mapped farmer partners"},
            {"label": "Open issues", "value": str(open_issues), "note": "Requests and recent photo issues"},
            {"label": "High mortality", "value": str(high_mortality), "note": "Recent sheds needing review"},
            {"label": "Recent visits", "value": str(len(visits[:7])), "note": "Logged visit entries"},
        ],
        "assigned_farms": [
            {"label": farm.farm_name or "-", "value": farm.farmer_code or "-", "note": f"{farm.name} • {farm.cluster or ''}"}
            for farm in farms
        ],
        "priority_issues": [
            {"label": req.request_type, "value": req.priority, "note": req.details}
            for req in support_requests[:5]
        ] + [
            {"label": photo.issue_type, "value": photo.priority, "note": f"{photo.shed} • {photo.notes}"}
            for photo in issue_photos[:5]
        ],
        "visit_history": [
            {"label": f"{visit.visit_date} / {db.get(User, visit.farmer_id).farm_name}", "value": visit.shed, "note": visit.issue_summary or "No major issue"}
            for visit in visits[:6]
        ],
    }


@app.get("/api/field/visits")
def field_visits(request: Request):
    user = get_current_user(request, "field")
    with session_scope() as db:
        farms = list(db.scalars(select(User).where(User.role == "farmer", User.field_officer == user.name).order_by(User.farm_name)))
        visits = list(db.scalars(select(FieldVisit).where(FieldVisit.officer_id == user.id).order_by(FieldVisit.visit_date.desc(), FieldVisit.created_at.desc())))
        payload = []
        for visit in visits:
            farmer = db.get(User, visit.farmer_id)
            payload.append({
                "label": f"{visit.visit_date} / {farmer.farm_name if farmer else '-'}",
                "value": visit.shed,
                "note": f"Avg wt {visit.avg_weight_g} g • Mortality {visit.mortality} • {visit.issue_summary or 'No major issue'}",
            })
        return {
            "profile": serialize_profile(user),
            "farms": [
                {"code": farm.farmer_code, "name": farm.farm_name, "cluster": farm.cluster}
                for farm in farms
            ],
            "visit_history": payload,
        }


@app.post("/api/field/visits")
def add_field_visit(payload: FieldVisitPayload, request: Request):
    user = get_current_user(request, "field")
    with session_scope() as db:
        farmer = get_farmer_by_code(db, payload.farmer_code)
        visit = FieldVisit(
            officer_id=user.id,
            farmer_id=farmer.id,
            visit_date=payload.visit_date,
            shed=payload.shed,
            avg_weight_g=payload.avg_weight_g,
            mortality=payload.mortality,
            feed_stock_note=payload.feed_stock_note,
            medicine_note=payload.medicine_note,
            issue_summary=payload.issue_summary,
            action_taken=payload.action_taken,
        )
        db.add(visit)
        db.commit()
    return {"success": True}


@app.get("/api/field/issues")
def field_issues(request: Request):
    user = get_current_user(request, "field")
    with session_scope() as db:
        farms = list(db.scalars(select(User).where(User.role == "farmer", User.field_officer == user.name)))
        farm_ids = [farm.id for farm in farms]
        requests = list(db.scalars(select(SupportRequest).where(SupportRequest.farmer_id.in_(farm_ids)).order_by(SupportRequest.created_at.desc()))) if farm_ids else []
        photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id.in_(farm_ids)).order_by(IssuePhoto.created_at.desc()))) if farm_ids else []
        return {
            "profile": serialize_profile(user),
            "requests": [
                {"label": f"{req.entry_date} / {req.request_type}", "value": req.status, "note": f"{req.priority} • {req.details}"}
                for req in requests
            ],
            "photos": [
                {"label": f"{photo.entry_date} / {photo.issue_type}", "value": photo.status, "note": f"{photo.shed} • {photo.notes}"}
                for photo in photos
            ],
        }


@app.get("/farmer-app")
@app.get("/farmer-app/")
def farmer_login_page():
    return app_file_response("farmer-app", "index.html")


@app.get("/farmer-app/{file_name:path}")
def farmer_app_files(file_name: str, request: Request):
    clean_name = file_name or "index.html"
    if clean_name in FARMER_APP_PUBLIC:
        return app_file_response("farmer-app", clean_name)
    try:
        get_current_user(request, "farmer")
    except HTTPException:
        return RedirectResponse(url="/farmer-app/", status_code=302)
    return app_file_response("farmer-app", clean_name)


@app.get("/field-app")
@app.get("/field-app/")
def field_login_page():
    return app_file_response("field-app", "index.html")


@app.get("/field-app/{file_name:path}")
def field_app_files(file_name: str, request: Request):
    clean_name = file_name or "index.html"
    if clean_name in FIELD_APP_PUBLIC:
        return app_file_response("field-app", clean_name)
    try:
        get_current_user(request, "field")
    except HTTPException:
        return RedirectResponse(url="/field-app/", status_code=302)
    return app_file_response("field-app", clean_name)


app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
