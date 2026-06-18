import hashlib
import json
import logging
import os
import re
from datetime import date
from datetime import datetime
from datetime import timedelta
from pathlib import Path
from typing import Callable
from urllib.error import URLError
from urllib.parse import quote
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import DateTime
from sqlalchemy import delete
from sqlalchemy import Float
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import Boolean
from sqlalchemy import or_
from sqlalchemy import String
from sqlalchemy import Text
from sqlalchemy import create_engine
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import Session
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship
from sqlalchemy.orm import sessionmaker
from starlette.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from itsdangerous import BadSignature
from itsdangerous import URLSafeSerializer


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_FILE = BASE_DIR / "data.json"
DB_FILE = BASE_DIR / "utsav.sqlite3"
UPLOADS_DIR = BASE_DIR / "uploads"

logger = logging.getLogger("utsav.auth")
logging.basicConfig(level=logging.INFO)

UPLOADS_DIR.mkdir(exist_ok=True)

LEGACY_DEMO_FARMER_PHONES = {
    "+919876543210",
    "+919876543211",
}
LEGACY_DEMO_FARMER_CODES = {
    "UF-042",
    "UF-057",
}
LEGACY_DEMO_FIELD_PHONES = {
    "+919898989898",
}
WEATHER_CACHE_TTL_SECONDS = 900
GEOCODE_CACHE_TTL_SECONDS = 86400
SESSION_MAX_AGE_SECONDS = int(os.getenv("SESSION_MAX_AGE_SECONDS", str(60 * 60 * 24 * 30)))
PHOTO_RETENTION_HOURS = int(os.getenv("PHOTO_RETENTION_HOURS", "48"))
FEED_BAG_WEIGHT_KG = int(os.getenv("FEED_BAG_WEIGHT_KG", "50"))
ROSS_308_FF_STANDARD_BY_AGE: dict[int, dict[str, int]] = {
    1: {"weight_g": 40, "feed_intake_g": 13},
    2: {"weight_g": 51, "feed_intake_g": 18},
    3: {"weight_g": 68, "feed_intake_g": 24},
    4: {"weight_g": 89, "feed_intake_g": 31},
    5: {"weight_g": 115, "feed_intake_g": 39},
    6: {"weight_g": 144, "feed_intake_g": 46},
    7: {"weight_g": 177, "feed_intake_g": 52},
    8: {"weight_g": 214, "feed_intake_g": 58},
    9: {"weight_g": 253, "feed_intake_g": 63},
    10: {"weight_g": 295, "feed_intake_g": 68},
    11: {"weight_g": 339, "feed_intake_g": 72},
    12: {"weight_g": 385, "feed_intake_g": 76},
    13: {"weight_g": 433, "feed_intake_g": 80},
    14: {"weight_g": 482, "feed_intake_g": 83},
    15: {"weight_g": 532, "feed_intake_g": 87},
    16: {"weight_g": 585, "feed_intake_g": 90},
    17: {"weight_g": 638, "feed_intake_g": 93},
    18: {"weight_g": 693, "feed_intake_g": 96},
    19: {"weight_g": 749, "feed_intake_g": 99},
    20: {"weight_g": 805, "feed_intake_g": 102},
    21: {"weight_g": 864, "feed_intake_g": 105},
    22: {"weight_g": 922, "feed_intake_g": 108},
    23: {"weight_g": 981, "feed_intake_g": 111},
    24: {"weight_g": 1041, "feed_intake_g": 113},
    25: {"weight_g": 1101, "feed_intake_g": 116},
    26: {"weight_g": 1161, "feed_intake_g": 119},
    27: {"weight_g": 1221, "feed_intake_g": 122},
    28: {"weight_g": 1280, "feed_intake_g": 125},
    29: {"weight_g": 1339, "feed_intake_g": 128},
    30: {"weight_g": 1398, "feed_intake_g": 131},
    31: {"weight_g": 1456, "feed_intake_g": 133},
    32: {"weight_g": 1514, "feed_intake_g": 136},
    33: {"weight_g": 1571, "feed_intake_g": 139},
    34: {"weight_g": 1627, "feed_intake_g": 142},
    35: {"weight_g": 1683, "feed_intake_g": 145},
    36: {"weight_g": 1738, "feed_intake_g": 147},
    37: {"weight_g": 1791, "feed_intake_g": 150},
    38: {"weight_g": 1844, "feed_intake_g": 153},
    39: {"weight_g": 1896, "feed_intake_g": 156},
    40: {"weight_g": 1946, "feed_intake_g": 158},
    41: {"weight_g": 1995, "feed_intake_g": 161},
    42: {"weight_g": 2043, "feed_intake_g": 164},
    43: {"weight_g": 2089, "feed_intake_g": 167},
    44: {"weight_g": 2135, "feed_intake_g": 169},
    45: {"weight_g": 2178, "feed_intake_g": 172},
    46: {"weight_g": 2221, "feed_intake_g": 175},
    47: {"weight_g": 2262, "feed_intake_g": 177},
    48: {"weight_g": 2301, "feed_intake_g": 180},
    49: {"weight_g": 2339, "feed_intake_g": 183},
    50: {"weight_g": 2375, "feed_intake_g": 185},
    51: {"weight_g": 2410, "feed_intake_g": 188},
    52: {"weight_g": 2444, "feed_intake_g": 191},
    53: {"weight_g": 2476, "feed_intake_g": 194},
    54: {"weight_g": 2506, "feed_intake_g": 196},
    55: {"weight_g": 2535, "feed_intake_g": 199},
    56: {"weight_g": 2563, "feed_intake_g": 201},
}
GO_LIVE_RESET_TOKEN = os.getenv("GO_LIVE_RESET_TOKEN", "").strip()
OWNER_ACCOUNT_SYNC_TOKEN = os.getenv("OWNER_ACCOUNT_SYNC_TOKEN", "").strip()
LOCATION_COORDINATE_OVERRIDES = {
    "korba-cluster": {"latitude": 22.3595, "longitude": 82.7501, "label": "Korba"},
    "korba": {"latitude": 22.3595, "longitude": 82.7501, "label": "Korba"},
    "champa": {"latitude": 22.0354, "longitude": 82.6421, "label": "Champa"},
    "jaijaipur": {"latitude": 21.8472, "longitude": 82.8173, "label": "Jaijaipur"},
    "bilaspur-cluster": {"latitude": 22.0797, "longitude": 82.1409, "label": "Bilaspur"},
    "bilaspur": {"latitude": 22.0797, "longitude": 82.1409, "label": "Bilaspur"},
    "nagpur": {"latitude": 21.1458, "longitude": 79.0882, "label": "Nagpur"},
}
_weather_cache: dict[str, dict] = {}
_geocode_cache: dict[str, dict] = {}
ROLE_COOKIE_NAMES = {
    "farmer": "utsav_farmer_session",
    "owner": "utsav_owner_session",
    "field": "utsav_field_session",
}


def hash_password(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", (value or "").strip())
    if not digits:
        return ""
    if digits.startswith("91") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"+91{digits[1:]}"
    if len(digits) == 10:
        return f"+91{digits}"
    return value.strip()


def format_phone_display(value: str) -> str:
    normalized = normalize_phone(value)
    digits = re.sub(r"\D", "", normalized)
    if digits.startswith("91") and len(digits) == 12:
        return f"0{digits[2:]}"
    return value


def format_bag_count(value: float | int | None) -> str:
    if value is None:
        return "0"
    numeric = float(value)
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:.2f}".rstrip("0").rstrip(".")


def format_feed_usage(value: float | int | None) -> str:
    if value is None:
        return "0 bags"
    numeric = max(float(value), 0.0)
    full_bags = int(numeric)
    extra_kg = (numeric - full_bags) * FEED_BAG_WEIGHT_KG
    parts: list[str] = []
    if full_bags:
        parts.append(f"{full_bags} bags")
    if extra_kg > 0.0001:
        parts.append(f"{format_bag_count(extra_kg)} kg")
    if not parts:
        parts.append("0 bags")
    return " + ".join(parts)


def slug_text(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "unassigned"


def farm_code_token(value: str, fallback: str = "") -> str:
    cleaned = re.sub(r"[^A-Z0-9]+", "", (value or "").strip().upper())
    return cleaned[:3] or fallback


def build_farm_code_base(farm_name: str, area: str) -> str:
    farm_token = farm_code_token(farm_name)
    area_token = farm_code_token(area)
    if not farm_token and not area_token:
        return "FARM"
    if not area_token:
        return farm_token
    if not farm_token:
        return area_token
    return f"{farm_token}-{area_token}"


def build_unique_farmer_code(db: Session, farm_name: str, area: str, exclude_user_id: int | None = None) -> str:
    base_code = build_farm_code_base(farm_name, area)
    candidate = base_code
    suffix = 2
    while True:
        query = select(User.id).where(User.role == "farmer", User.farmer_code == candidate)
        if exclude_user_id is not None:
            query = query.where(User.id != exclude_user_id)
        existing_user_id = db.scalar(query)
        if not existing_user_id:
            return candidate
        candidate = f"{base_code}-{suffix}"
        suffix += 1


def cache_get(store: dict[str, dict], key: str):
    entry = store.get(key)
    if not entry:
        return None
    if entry["expires_at"] <= datetime.utcnow().timestamp():
        store.pop(key, None)
        return None
    return entry["value"]


def cache_set(store: dict[str, dict], key: str, value, ttl_seconds: int):
    store[key] = {
        "value": value,
        "expires_at": datetime.utcnow().timestamp() + ttl_seconds,
    }


def photo_retention_cutoff(now: datetime | None = None) -> datetime:
    reference = now or datetime.utcnow()
    return reference - timedelta(hours=PHOTO_RETENTION_HOURS)


def photo_is_available(created_at: datetime | None) -> bool:
    if not created_at:
        return False
    return created_at >= photo_retention_cutoff()


def photo_url_for(stored_name: str | None, created_at: datetime | None) -> str:
    if not stored_name or not photo_is_available(created_at):
        return ""
    return f"/uploads/{stored_name}"


def session_serializer() -> URLSafeSerializer:
    secret = os.getenv("SESSION_SECRET", "utsav-dev-session-secret")
    return URLSafeSerializer(secret, salt="utsav-role-cookie")


def role_cookie_name(role: str) -> str:
    return ROLE_COOKIE_NAMES.get(role, f"utsav_{role}_session")


def build_role_cookie_payload(user: "User") -> dict:
    return {
        "user_id": int(user.id),
        "role": user.role,
        "name": user.name,
        "last_seen_at": datetime.utcnow().isoformat(),
    }


def set_role_auth_cookie(response: JSONResponse, user: "User"):
    payload = session_serializer().dumps(build_role_cookie_payload(user))
    response.set_cookie(
        key=role_cookie_name(user.role),
        value=payload,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def clear_role_auth_cookies(response: JSONResponse):
    for role in ROLE_COOKIE_NAMES:
        response.delete_cookie(role_cookie_name(role), path="/")


def expected_role_from_request(request: Request) -> str | None:
    explicit = (request.headers.get("X-Utsav-Role") or "").strip().lower()
    if explicit in ROLE_COOKIE_NAMES:
        return explicit
    path = request.url.path
    if path.startswith("/api/farmer") or path.startswith("/farmer-app"):
        return "farmer"
    if path.startswith("/api/owner") or path.startswith("/owner-app"):
        return "owner"
    if path.startswith("/api/field") or path.startswith("/field-app"):
        return "field"
    return None


def read_role_cookie_identity(request: Request, expected_role: str | None = None) -> dict | None:
    role = expected_role or expected_role_from_request(request)
    if not role:
        return None
    cookie_value = request.cookies.get(role_cookie_name(role))
    if not cookie_value:
        return None
    try:
        payload = session_serializer().loads(cookie_value)
    except BadSignature:
        return None
    if payload.get("role") != role or not payload.get("user_id"):
        return None
    return payload


def is_placeholder_field_phone(value: str) -> bool:
    return (value or "").startswith("field::")


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


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    current_shed: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bird_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    initial_batch_strength: Mapped[int | None] = mapped_column(Integer, nullable=True)
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
    feed_used_bags: Mapped[float] = mapped_column(Float)
    water_liters: Mapped[int] = mapped_column(Integer)
    avg_weight_g: Mapped[int] = mapped_column(Integer)
    temperature_c: Mapped[float] = mapped_column(Float)
    humidity_pct: Mapped[int] = mapped_column(Integer)
    litter_condition: Mapped[str] = mapped_column(String(40))
    litter_notes: Mapped[str] = mapped_column(Text, default="")
    litter_photo_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    litter_photo_stored: Mapped[str | None] = mapped_column(String(240), nullable=True)
    mortality_photo_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    mortality_photo_stored: Mapped[str | None] = mapped_column(String(240), nullable=True)
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


class OperationalCost(Base):
    __tablename__ = "operational_costs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    expense_category: Mapped[str] = mapped_column(String(120))
    item_name: Mapped[str] = mapped_column(String(200))
    shed: Mapped[str] = mapped_column(String(40), default="")
    vendor_name: Mapped[str] = mapped_column(String(160), default="")
    amount: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stored_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(80), default="Submitted to owner finance")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SaleRecord(Base):
    __tablename__ = "sale_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    entry_date: Mapped[str] = mapped_column(String(20), index=True)
    bill_number: Mapped[str] = mapped_column(String(120))
    party_name: Mapped[str] = mapped_column(String(160))
    total_weight_kg: Mapped[str] = mapped_column(String(80))
    rate_per_kg: Mapped[str] = mapped_column(String(80), default="")
    amount: Mapped[str] = mapped_column(String(80), default="")
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stored_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(80), default="Submitted to owner finance")
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


class PartyContact(Base):
    __tablename__ = "party_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(140))
    phone: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    market_area: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    preferred_clusters: Mapped[str] = mapped_column(Text, default="")
    preferred_farms: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SaleReadyRule(Base):
    __tablename__ = "sale_ready_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    ready_weight_g: Mapped[int] = mapped_column(Integer, default=0)
    auto_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SaleAlertDispatch(Base):
    __tablename__ = "sale_alert_dispatches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    daily_entry_id: Mapped[int] = mapped_column(ForeignKey("daily_entries.id"), index=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    party_id: Mapped[int] = mapped_column(ForeignKey("party_contacts.id"), index=True)
    channel: Mapped[str] = mapped_column(String(40), default="whatsapp")
    status: Mapped[str] = mapped_column(String(40), default="pending")
    external_message_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    message_text: Mapped[str] = mapped_column(Text, default="")
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
    max_age=SESSION_MAX_AGE_SECONDS,
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
    "/downloads/UtsavOwnerLite-debug.apk": "UtsavOwnerLite-debug.apk",
}

FARMER_APP_PUBLIC = {
    "index.html",
    "styles.css",
    "app.js",
    "manifest.webmanifest",
    "sw.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
}
FIELD_APP_PUBLIC = {"index.html", "styles.css", "app.js"}
OWNER_APP_PUBLIC = {"index.html", "styles.css", "app.js"}


class LoginPayload(BaseModel):
    phone: str
    password: str
    role: str


class FeedBalancePayload(BaseModel):
    shed: str = ""
    feed_type: str
    bags: int = Field(ge=0)


class FeedInwardPayload(BaseModel):
    inward_date: str
    feed_type: str
    bags: int = Field(gt=0)
    shed: str = ""


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
    feed_used_bags: float = Field(ge=0)
    water_liters: int = Field(ge=0)
    avg_weight_g: int = Field(ge=0)
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


class OwnerFarmerEnrollmentPayload(BaseModel):
    farmer_name: str
    phone: str
    password: str
    cluster: str
    farm_name: str
    farmer_code: str
    field_officer: str
    field_officer_phone: str = ""
    farm_capacity: str = ""
    active_sheds: int = Field(default=1, ge=1)


class OwnerFarmerUpdatePayload(BaseModel):
    farmer_name: str
    phone: str
    password: str = ""
    cluster: str = ""
    farm_name: str
    farmer_code: str
    field_officer: str = ""
    field_officer_phone: str = ""
    farm_capacity: str = ""
    active_sheds: int = Field(default=1, ge=1)


class OwnerBatchEntryPayload(BaseModel):
    farmer_code: str
    active_batch: str
    current_shed: str = ""
    bird_age_days: int = Field(default=0, ge=0)
    initial_batch_strength: int = Field(default=0, ge=0)


class OwnerPartyPayload(BaseModel):
    name: str
    phone: str
    market_area: str = ""
    preferred_clusters: str = ""
    preferred_farms: str = ""
    notes: str = ""
    is_active: bool = True


class OwnerSaleReadyRulePayload(BaseModel):
    farmer_code: str
    ready_weight_g: int = Field(default=0, ge=0)
    auto_whatsapp_enabled: bool = False
    notes: str = ""


class OwnerOperationalCostPayload(BaseModel):
    farmer_code: str
    entry_date: str
    expense_category: str
    item_name: str
    shed: str = ""
    vendor_name: str = ""
    amount: str = ""
    notes: str = ""


class OwnerSalePayload(BaseModel):
    farmer_code: str
    entry_date: str
    bill_number: str
    party_name: str
    total_weight_kg: str
    rate_per_kg: str = ""
    amount: str = ""


class OwnerSaleRateUpdatePayload(BaseModel):
    rate_per_kg: str


class OwnerProfileUpdatePayload(BaseModel):
    name: str
    phone: str
    password: str = ""
    cluster: str = ""


class FarmerProfileUpdatePayload(BaseModel):
    farmer_name: str
    phone: str
    password: str = ""
    cluster: str = ""
    farm_name: str
    field_officer: str = ""
    farm_capacity: str = ""
    active_sheds: int = Field(default=1, ge=1)


class OperationalCostPayload(BaseModel):
    entry_date: str
    expense_category: str
    item_name: str
    shed: str = ""
    vendor_name: str = ""
    amount: str = ""
    notes: str = ""


class SalePayload(BaseModel):
    entry_date: str
    bill_number: str
    party_name: str
    total_weight_kg: str
    rate_per_kg: str = ""
    amount: str = ""


def safe_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return cleaned or "document"


def today_string() -> str:
    return str(date.today())


def session_scope() -> Session:
    return SessionLocal()


def app_setting_value(db: Session, key: str) -> str:
    setting = db.get(AppSetting, key)
    return (setting.value or "") if setting else ""


def set_app_setting(db: Session, key: str, value: str):
    setting = db.get(AppSetting, key)
    if not setting:
        setting = AppSetting(key=key, value=value)
    else:
        setting.value = value
        setting.updated_at = datetime.utcnow()
    db.add(setting)


def collect_uploaded_file_names_for_reset(db: Session) -> set[str]:
    stored_names: set[str] = set()
    for value in db.scalars(select(DailyEntry.litter_photo_stored).where(DailyEntry.litter_photo_stored.is_not(None))):
        if value:
            stored_names.add(value)
    for value in db.scalars(select(DocumentUpload.stored_name).where(DocumentUpload.stored_name.is_not(None))):
        if value:
            stored_names.add(value)
    for value in db.scalars(select(OperationalCost.stored_name).where(OperationalCost.stored_name.is_not(None))):
        if value:
            stored_names.add(value)
    for value in db.scalars(select(SaleRecord.stored_name).where(SaleRecord.stored_name.is_not(None))):
        if value:
            stored_names.add(value)
    for value in db.scalars(select(IssuePhoto.stored_name).where(IssuePhoto.stored_name.is_not(None))):
        if value:
            stored_names.add(value)
    return stored_names


def remove_uploaded_files(stored_names: set[str]):
    for stored_name in stored_names:
        remove_file_if_exists(stored_name)


def purge_rollout_data(db: Session) -> set[str]:
    stored_names = collect_uploaded_file_names_for_reset(db)
    db.execute(delete(SaleAlertDispatch))
    db.execute(delete(SaleReadyRule))
    db.execute(delete(PartyContact))
    db.execute(delete(FieldVisit))
    db.execute(delete(IssuePhoto))
    db.execute(delete(SaleRecord))
    db.execute(delete(OperationalCost))
    db.execute(delete(DocumentUpload))
    db.execute(delete(SupportRequest))
    db.execute(delete(VaccinationLog))
    db.execute(delete(MedicineLog))
    db.execute(delete(MedicineStock))
    db.execute(delete(MortalityLog))
    db.execute(delete(FeedInward))
    db.execute(delete(FeedStock))
    db.execute(delete(DailyEntry))
    db.execute(delete(User).where(User.role != "owner"))
    return stored_names


def maybe_run_go_live_reset() -> None:
    if not GO_LIVE_RESET_TOKEN:
        return
    with session_scope() as db:
        if app_setting_value(db, "go_live_reset_token") == GO_LIVE_RESET_TOKEN:
            return
        stored_names = purge_rollout_data(db)
        set_app_setting(db, "go_live_reset_token", GO_LIVE_RESET_TOKEN)
        db.commit()
    remove_uploaded_files(stored_names)
    logger.info("go_live_reset_completed token=%s", GO_LIVE_RESET_TOKEN)


def maybe_run_owner_account_sync() -> None:
    if not OWNER_ACCOUNT_SYNC_TOKEN:
        return
    owner_phone_value = normalize_phone(os.getenv("OWNER_APP_DEFAULT_PHONE", ""))
    owner_name_value = os.getenv("OWNER_APP_DEFAULT_NAME", "").strip()
    owner_password_value = os.getenv("OWNER_APP_DEFAULT_PASSWORD", "").strip()
    with session_scope() as db:
        if app_setting_value(db, "owner_account_sync_token") == OWNER_ACCOUNT_SYNC_TOKEN:
            return
        owner = db.scalar(select(User).where(User.role == "owner").order_by(User.id))
        if not owner:
            return
        if owner_name_value:
            owner.name = owner_name_value
        if owner_phone_value:
            owner.phone = owner_phone_value
        if owner_password_value:
            owner.password_hash = hash_password(owner_password_value)
        db.add(owner)
        set_app_setting(db, "owner_account_sync_token", OWNER_ACCOUNT_SYNC_TOKEN)
        db.commit()
    logger.info("owner_account_sync_completed token=%s", OWNER_ACCOUNT_SYNC_TOKEN)


def serialize_profile(user: User) -> dict:
    return {
        "id": user.id,
        "role": user.role,
        "farmer_name": user.name,
        "name": user.name,
        "cluster": user.cluster or "",
        "farm_name": user.farm_name or "",
        "farmer_code": user.farmer_code or "",
        "phone": format_phone_display(user.phone),
        "active_batch": user.active_batch or "",
        "current_shed": user.current_shed or "",
        "bird_age_days": user.bird_age_days or 0,
        "initial_batch_strength": user.initial_batch_strength or 0,
        "field_officer": user.field_officer or "",
        "farm_capacity": user.farm_capacity or "",
        "active_sheds": user.active_sheds or 0,
        "title": user.title or "",
    }


def fetch_json(url: str) -> dict | None:
    try:
        with urlopen(url, timeout=3) as response:
            return json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, ValueError) as exc:
        logger.info("weather_fetch_failed url=%s error=%s", url, exc)
        return None


def resolve_location_coordinates(user: User) -> dict | None:
    cluster_slug = slug_text(user.cluster or "")
    override = LOCATION_COORDINATE_OVERRIDES.get(cluster_slug)
    if override:
        return {
            "latitude": override["latitude"],
            "longitude": override["longitude"],
            "label": override["label"],
        }

    query = (user.cluster or user.farm_name or "").strip()
    if not query:
        return None

    cache_key = slug_text(query)
    cached = cache_get(_geocode_cache, cache_key)
    if cached:
        return cached

    payload = fetch_json(
        f"https://geocoding-api.open-meteo.com/v1/search?name={quote(query)}&count=1&language=en&format=json"
    )
    results = (payload or {}).get("results") or []
    if not results:
        return None

    first = results[0]
    value = {
        "latitude": first.get("latitude"),
        "longitude": first.get("longitude"),
        "label": first.get("name") or query,
    }
    if value["latitude"] is None or value["longitude"] is None:
        return None
    cache_set(_geocode_cache, cache_key, value, GEOCODE_CACHE_TTL_SECONDS)
    return value


def get_outside_weather(user: User) -> dict | None:
    location = resolve_location_coordinates(user)
    if not location:
        return None

    cache_key = f'{location["latitude"]:.4f},{location["longitude"]:.4f}'
    cached = cache_get(_weather_cache, cache_key)
    if cached:
        return cached

    payload = fetch_json(
        "https://api.open-meteo.com/v1/forecast"
        f'?latitude={location["latitude"]}&longitude={location["longitude"]}'
        "&current=temperature_2m,relative_humidity_2m"
        "&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_max,relative_humidity_2m_min"
        "&timezone=auto&forecast_days=1"
    )
    current = (payload or {}).get("current") or {}
    daily = (payload or {}).get("daily") or {}
    temperature = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")
    if temperature is None or humidity is None:
        return None

    def first_daily_value(key: str):
        values = daily.get(key) or []
        return values[0] if values else None

    value = {
        "location_label": location["label"],
        "temperature_c": temperature,
        "humidity_pct": humidity,
        "temperature_high_c": first_daily_value("temperature_2m_max"),
        "temperature_low_c": first_daily_value("temperature_2m_min"),
        "humidity_high_pct": first_daily_value("relative_humidity_2m_max"),
        "humidity_low_pct": first_daily_value("relative_humidity_2m_min"),
        "observed_at": current.get("time", ""),
        "source_note": "Outside weather reference. Shed sensor data nahi hai.",
    }
    cache_set(_weather_cache, cache_key, value, WEATHER_CACHE_TTL_SECONDS)
    return value


def whatsapp_config() -> dict[str, str]:
    return {
        "access_token": os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip(),
        "phone_number_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID", "").strip(),
        "template_name": os.getenv("WHATSAPP_TEMPLATE_NAME", "").strip(),
        "template_language": os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "en").strip() or "en",
        "graph_version": os.getenv("WHATSAPP_GRAPH_VERSION", "v23.0").strip() or "v23.0",
    }


def whatsapp_ready() -> bool:
    config = whatsapp_config()
    return bool(config["access_token"] and config["phone_number_id"] and config["template_name"])


def normalize_whatsapp_recipient(phone: str) -> str:
    normalized = normalize_phone(phone)
    return re.sub(r"\D", "", normalized)


def make_sale_ready_message(farmer: User, entry: DailyEntry, rule: SaleReadyRule) -> str:
    return (
        f"Birds are ready for sale at {farmer.farm_name or 'selected farm'}"
        f" ({farmer.farmer_code or '-'})"
        f" • Shed {entry.shed or farmer.current_shed or '-'}"
        f" • Avg wt {entry.avg_weight_g} g"
        f" • Target {rule.ready_weight_g} g"
        f" • Batch {farmer.active_batch or '-'}."
    )


def send_whatsapp_template_message(to_phone: str, body_values: list[str]) -> dict:
    config = whatsapp_config()
    endpoint = (
        f"https://graph.facebook.com/{config['graph_version']}/"
        f"{config['phone_number_id']}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": normalize_whatsapp_recipient(to_phone),
        "type": "template",
        "template": {
            "name": config["template_name"],
            "language": {"code": config["template_language"]},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": value} for value in body_values],
                }
            ],
        },
    }
    request = UrlRequest(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config['access_token']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=20) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw or "{}")


def get_current_user(request: Request, role: str | None = None) -> User:
    cookie_identity = read_role_cookie_identity(request, role)
    user_id = (cookie_identity or {}).get("user_id") or request.session.get("user_id")
    user_role = (cookie_identity or {}).get("role") or request.session.get("role")
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
        request.session["last_seen_at"] = datetime.utcnow().isoformat()
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


def make_shed_defaults(entries: list[DailyEntry]) -> list[dict]:
    latest_by_shed = latest_entries_by_shed(entries)
    items: list[dict] = []
    for shed, entry in latest_by_shed.items():
        live_birds = max(int(entry.opening_birds) - int(entry.mortality), 0)
        items.append(
            {
                "shed": shed,
                "live_birds": live_birds,
                "entry_date": entry.entry_date,
            }
        )
    return sorted(items, key=lambda item: item["shed"])


def resolve_opening_birds_for_entry(
    db: Session,
    farmer: User,
    shed: str,
    entry_date: str,
    exclude_entry_id: int | None = None,
) -> int:
    query = (
        select(DailyEntry)
        .where(
            DailyEntry.farmer_id == farmer.id,
            DailyEntry.shed == shed,
            DailyEntry.entry_date < entry_date,
        )
        .order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())
    )
    previous_entries = db.scalars(query).all()
    previous = next((item for item in previous_entries if exclude_entry_id is None or item.id != exclude_entry_id), None)
    if previous:
        return max(int(previous.opening_birds) - int(previous.mortality), 0)
    return max(int(farmer.initial_batch_strength or 0), 0)


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


def get_expected_broiler_standard(age_days: int) -> dict | None:
    if age_days <= 0:
        return None
    min_day = min(ROSS_308_FF_STANDARD_BY_AGE)
    max_day = max(ROSS_308_FF_STANDARD_BY_AGE)
    normalized_day = max(min_day, min(age_days, max_day))
    return {
        "age_days": normalized_day,
        "weight_g": ROSS_308_FF_STANDARD_BY_AGE[normalized_day]["weight_g"],
        "feed_intake_g": ROSS_308_FF_STANDARD_BY_AGE[normalized_day]["feed_intake_g"],
    }


def get_current_live_birds_for_farmer(user: User, entries: list[DailyEntry]) -> int:
    latest_by_shed = latest_entries_by_shed(entries)
    if latest_by_shed:
        return max(
            int(
                sum(
                    max(float(item.opening_birds or 0) - float(item.mortality or 0), 0)
                    for item in latest_by_shed.values()
                )
            ),
            0,
        )
    return max(int(user.initial_batch_strength or 0), 0)


def build_expected_feed_metrics(user: User, entries: list[DailyEntry]) -> list[dict]:
    bird_age_days = int(user.bird_age_days or 0)
    live_birds = get_current_live_birds_for_farmer(user, entries)
    standard = get_expected_broiler_standard(bird_age_days)
    if not standard or live_birds <= 0:
        return []

    expected_weight_g = standard["weight_g"]
    expected_feed_intake_g = standard["feed_intake_g"]
    expected_total_feed_kg = (live_birds * expected_feed_intake_g) / 1000
    expected_total_bags = expected_total_feed_kg / FEED_BAG_WEIGHT_KG
    total_live_weight_kg = (live_birds * expected_weight_g) / 1000

    return [
        {
            "label": "Bird age today",
            "value": f"{bird_age_days} days",
            "note": "Current batch age",
        },
        {
            "label": "Live birds",
            "value": f"{live_birds:,}",
            "note": "Auto count from submitted mortality",
        },
        {
            "label": "Expected weight",
            "value": f"{expected_weight_g} g",
            "note": f"Per bird standard for day {standard['age_days']}",
        },
        {
            "label": "Expected intake / bird",
            "value": f"{expected_feed_intake_g} g",
            "note": "Standard feed need for today",
        },
        {
            "label": "Expected feed today",
            "value": f"{expected_total_feed_kg:,.1f} kg",
            "note": f"Estimated total live weight {total_live_weight_kg:,.0f} kg",
        },
        {
            "label": "Expected bags today",
            "value": f"{expected_total_bags:,.2f} bags",
            "note": f"Using {FEED_BAG_WEIGHT_KG} kg per bag",
        },
    ]


def make_medicine_summary(records: list[MedicineStock]) -> list[dict]:
    return [
        {
            "label": record.name,
            "value": record.quantity,
            "note": record.notes or record.status,
        }
        for record in records[:6]
    ]


def make_medicine_log(records: list[MedicineLog]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.name}",
            "value": record.quantity,
            "note": record.notes or record.status,
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
            "value": f"{record.mortality} mortality • {format_feed_usage(record.feed_used_bags)} feed",
            "note": join_present(
                [
                    f"Litter {record.litter_condition}",
                    record.litter_notes or "",
                    "Photo attached" if photo_is_available(record.created_at) and record.litter_photo_name else "",
                    "Mortality photo attached" if photo_is_available(record.created_at) and record.mortality_photo_name else "",
                ]
            )
            or f"Water {record.water_liters} L • Avg wt {record.avg_weight_g} g • Temp {record.temperature_c} C",
        }
        for record in records
    ]


def serialize_daily_entry_record(record: DailyEntry) -> dict:
    return {
        "id": record.id,
        "entry_date": record.entry_date,
        "can_edit_today": record.entry_date == today_string(),
        "shed": record.shed,
        "opening_birds": record.opening_birds,
        "mortality": record.mortality,
        "culls": record.culls,
        "feed_used_bags": record.feed_used_bags,
        "feed_used_label": format_feed_usage(record.feed_used_bags),
        "water_liters": record.water_liters,
        "avg_weight_g": record.avg_weight_g,
        "temperature_c": record.temperature_c,
        "humidity_pct": record.humidity_pct,
        "litter_condition": record.litter_condition,
        "litter_notes": record.litter_notes or "",
        "litter_photo_name": record.litter_photo_name or "" if photo_is_available(record.created_at) else "",
        "litter_photo_url": photo_url_for(record.litter_photo_stored, record.created_at),
        "mortality_photo_name": record.mortality_photo_name or "" if photo_is_available(record.created_at) else "",
        "mortality_photo_url": photo_url_for(record.mortality_photo_stored, record.created_at),
        "power_cut_hours": record.power_cut_hours,
        "dg_hours": record.dg_hours,
        "uniformity_pct": record.uniformity_pct,
        "issues": record.issues or "",
        "remarks": record.remarks or "",
    }


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
            "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
        }
        for record in records
    ]


def make_operational_cost_history(records: list[OperationalCost]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.expense_category}",
            "value": record.amount or "No amount",
            "note": join_present(
                [
                    record.item_name,
                    record.shed,
                    record.vendor_name,
                    record.notes,
                    f"File: {record.file_name}" if record.file_name else "",
                ]
            ),
            "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
        }
        for record in records
    ]


def make_sales_history(records: list[SaleRecord]) -> list[dict]:
    return [
        {
            "sale_id": record.id,
            "label": f"{record.entry_date} / Bill {record.bill_number}",
            "value": compute_sale_amount_text(record.total_weight_kg, record.rate_per_kg, record.amount),
            "rate_per_kg": record.rate_per_kg or "",
            "total_weight_kg": record.total_weight_kg or "",
            "note": join_present(
                [
                    record.party_name,
                    f"{record.total_weight_kg} kg",
                    f"Rate {record.rate_per_kg}/kg" if record.rate_per_kg else "",
                    f"File: {record.file_name}" if record.file_name else "",
                ]
            ),
            "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
        }
        for record in records
    ]


def make_issue_photo_history(records: list[IssuePhoto]) -> list[dict]:
    return [
        {
            "label": f"{record.entry_date} / {record.issue_type} / {record.shed}",
            "value": record.status,
            "note": join_present(
                [
                    f"{record.priority} priority",
                    record.notes,
                    f"File: {record.file_name}" if photo_is_available(record.created_at) else "Photo expired",
                ]
            ),
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
    total_feed_kg = total_feed_bags * FEED_BAG_WEIGHT_KG
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
        {"label": "Feed consumed", "value": f"{total_feed_kg:,.0f} kg", "note": f"{format_bag_count(total_feed_bags)} total bags recorded in cycle ({FEED_BAG_WEIGHT_KG} kg per bag)"},
        {"label": "Current live weight", "value": f"{weighted_live_weight_kg:,.0f} kg", "note": f"Average body weight {avg_weight_g:,.0f} g"},
        {"label": "Feed per bird", "value": f"{feed_per_bird_kg:.2f} kg", "note": f"Mortality {int(total_mortality):,} • culls {int(total_culls):,}"},
    ]


def build_owner_farm_performance(farmers: list[User], entries: list[DailyEntry]) -> list[dict]:
    entries_by_farmer: dict[int, list[DailyEntry]] = {}
    for entry in entries:
        entries_by_farmer.setdefault(entry.farmer_id, []).append(entry)

    items: list[dict] = []
    for farmer in farmers:
        farmer_entries = entries_by_farmer.get(farmer.id, [])
        metrics = build_performance_metrics(farmer_entries)
        metric_map = {item["label"]: item for item in metrics}
        items.append(
            {
                "farm_name": farmer.farm_name or "",
                "farmer_name": farmer.name or "",
                "farmer_code": farmer.farmer_code or "",
                "cluster": farmer.cluster or "",
                "current_batch": farmer.active_batch or "",
                "shed_count": farmer.active_sheds or 0,
                "history_days": len({entry.entry_date for entry in farmer_entries}),
                "latest_entry_date": farmer_entries[0].entry_date if farmer_entries else "",
                "summary": {
                    "running_fcr": metric_map.get("Running FCR", {}).get("value", "-"),
                    "livability": metric_map.get("Livability", {}).get("value", "-"),
                    "current_live_weight": metric_map.get("Current live weight", {}).get("value", "-"),
                },
                "batch_metrics": metrics,
            }
        )
    return items


def build_owner_farm_reports(
    farmers: list[User],
    entries: list[DailyEntry],
    operational_costs: list[OperationalCost],
    sales: list[SaleRecord],
    documents: list[DocumentUpload],
    feed_inward: list[FeedInward],
) -> list[dict]:
    entries_by_farmer: dict[int, list[DailyEntry]] = {}
    costs_by_farmer: dict[int, list[OperationalCost]] = {}
    sales_by_farmer: dict[int, list[SaleRecord]] = {}
    documents_by_farmer: dict[int, list[DocumentUpload]] = {}
    inward_by_farmer: dict[int, list[FeedInward]] = {}

    for item in entries:
        entries_by_farmer.setdefault(item.farmer_id, []).append(item)
    for item in operational_costs:
        costs_by_farmer.setdefault(item.farmer_id, []).append(item)
    for item in sales:
        sales_by_farmer.setdefault(item.farmer_id, []).append(item)
    for item in documents:
        documents_by_farmer.setdefault(item.farmer_id, []).append(item)
    for item in feed_inward:
        inward_by_farmer.setdefault(item.farmer_id, []).append(item)

    reports: list[dict] = []
    for farmer in farmers:
        farmer_entries = entries_by_farmer.get(farmer.id, [])
        farmer_costs = costs_by_farmer.get(farmer.id, [])
        farmer_sales = sales_by_farmer.get(farmer.id, [])
        farmer_documents = documents_by_farmer.get(farmer.id, [])
        farmer_inward = inward_by_farmer.get(farmer.id, [])

        total_operational_cost = sum(parse_amount_value(item.amount) for item in farmer_costs)
        total_sale_amount = sum(compute_sale_amount_value(item.total_weight_kg, item.rate_per_kg, item.amount) for item in farmer_sales)
        total_sale_weight = sum(parse_amount_value(item.total_weight_kg) for item in farmer_sales)
        total_bill_amount = sum(parse_amount_value(item.amount) for item in farmer_documents)
        total_feed_inward_bags = sum(float(item.bags or 0) for item in farmer_inward)
        net_position = total_sale_amount - total_operational_cost

        reports.append(
            {
                "farm_name": farmer.farm_name or "",
                "farmer_name": farmer.name or "",
                "farmer_code": farmer.farmer_code or "",
                "cluster": farmer.cluster or "",
                "current_batch": farmer.active_batch or "",
                "bird_age_days": farmer.bird_age_days or 0,
                "shed_count": farmer.active_sheds or 0,
                "latest_entry_date": farmer_entries[0].entry_date if farmer_entries else "",
                "summary": {
                    "operational_cost_total": total_operational_cost,
                    "sales_total": total_sale_amount,
                    "sales_weight_kg": total_sale_weight,
                    "net_position": net_position,
                },
                "report_kpis": [
                    {"label": "Active batch", "value": farmer.active_batch or "-", "note": f"{farmer.bird_age_days or 0} days • {farmer.active_sheds or 0} sheds"},
                    {"label": "History days", "value": str(len({entry.entry_date for entry in farmer_entries})), "note": farmer_entries[0].entry_date if farmer_entries else "No entry yet"},
                    {"label": "Operational cost", "value": f"Rs {total_operational_cost:,.0f}", "note": f"{len(farmer_costs)} expense entries"},
                    {"label": "Sales amount", "value": f"Rs {total_sale_amount:,.0f}", "note": f"{len(farmer_sales)} sale entries"},
                    {"label": "Sale weight", "value": f"{total_sale_weight:,.0f} kg", "note": "Total sold weight reported"},
                    {"label": "Net position", "value": f"Rs {net_position:,.0f}", "note": "Sales amount minus operational cost"},
                    {"label": "Uploaded bill amount", "value": f"Rs {total_bill_amount:,.0f}", "note": f"{len(farmer_documents)} uploaded bills/documents"},
                    {"label": "Feed inward", "value": f"{total_feed_inward_bags:,.0f} bags", "note": f"{len(farmer_inward)} inward entries"},
                ],
                "performance_kpis": build_performance_metrics(farmer_entries),
                "expense_breakdown": summarize_operational_cost_breakdown(farmer_costs),
                "recent_expenses": make_operational_cost_history(farmer_costs[:10]),
                "recent_sales": make_sales_history(farmer_sales[:10]),
                "recent_documents": make_document_history(farmer_documents[:10]),
                "recent_feed_inward": make_feed_history(farmer_inward[:10]),
                "recent_daily_entries": [serialize_daily_entry_record(entry) for entry in farmer_entries[:10]],
            }
        )
    return reports


def summarize_owner_latest_entries(entries: list[DailyEntry], db: Session) -> list[dict]:
    latest_by_farmer: dict[int, DailyEntry] = {}
    for entry in entries:
        if entry.farmer_id not in latest_by_farmer:
            latest_by_farmer[entry.farmer_id] = entry

    items = []
    for farmer_id, entry in latest_by_farmer.items():
        farmer = db.get(User, farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {entry.shed}",
                "value": f"{entry.entry_date}",
                "note": (
                    f"Mortality {entry.mortality} • Feed {format_feed_usage(entry.feed_used_bags)} • "
                    f"Water {entry.water_liters} L • Avg wt {entry.avg_weight_g} g"
                ),
                "farmer_code": farmer.farmer_code or "",
                "farmer_name": farmer.name,
                "phone": format_phone_display(farmer.phone),
                "farm_name": farmer.farm_name or "",
                "cluster": farmer.cluster or "",
                "field_officer": farmer.field_officer or "",
                "farm_capacity": farmer.farm_capacity or "",
                "active_sheds": farmer.active_sheds or 1,
                "active_batch": farmer.active_batch or "",
                "current_shed": entry.shed or farmer.current_shed or "",
                "bird_age_days": farmer.bird_age_days or 0,
            }
        )
    return items[:8]


def build_owner_daily_entry_hierarchy(
    farmers: list[User],
    entries: list[DailyEntry],
    feed_stock_records: list[FeedStock] | None = None,
) -> list[dict]:
    entries_by_farmer: dict[int, list[DailyEntry]] = {}
    for entry in entries:
        entries_by_farmer.setdefault(entry.farmer_id, []).append(entry)
    feed_stock_totals: dict[int, int] = {}
    for item in (feed_stock_records or []):
        feed_stock_totals[item.farmer_id] = feed_stock_totals.get(item.farmer_id, 0) + int(item.bags or 0)

    hierarchy: list[dict] = []
    for farmer in farmers:
        farmer_entries = entries_by_farmer.get(farmer.id, [])
        entry_count = len(farmer_entries)
        latest_entry_date = farmer_entries[0].entry_date if farmer_entries else ""
        active_sheds = int(farmer.active_sheds or 0)
        default_sheds = [f"Shed {index}" for index in range(1, active_sheds + 1)]
        current_shed = (farmer.current_shed or "").strip()
        if current_shed and current_shed not in default_sheds:
            default_sheds.insert(0, current_shed)

        date_map: dict[str, list[DailyEntry]] = {}
        for record in farmer_entries:
            date_map.setdefault(record.entry_date, []).append(record)

        daily_groups: list[dict] = []
        for entry_date in sorted(date_map.keys(), reverse=True):
            date_entries = date_map[entry_date]
            shed_rows: dict[str, DailyEntry | None] = {}
            for shed_name in default_sheds:
                shed_rows.setdefault(shed_name, None)
            for record in date_entries:
                shed_name = record.shed or current_shed or "Unassigned shed"
                shed_rows[shed_name] = record

            rows: list[dict] = []
            for shed_name, record in shed_rows.items():
                rows.append(
                    {
                        "shed_name": shed_name,
                        "has_entry": bool(record),
                        "opening_birds": record.opening_birds if record else None,
                        "mortality": record.mortality if record else None,
                        "culls": record.culls if record else None,
                        "feed_used_bags": record.feed_used_bags if record else None,
                        "feed_used_label": format_feed_usage(record.feed_used_bags) if record else "",
                        "water_liters": record.water_liters if record else None,
                        "avg_weight_g": record.avg_weight_g if record else None,
                        "temperature_c": record.temperature_c if record else None,
                        "humidity_pct": record.humidity_pct if record else None,
                        "litter_condition": record.litter_condition if record else "",
                        "litter_notes": record.litter_notes or "" if record else "",
                        "litter_photo_name": (record.litter_photo_name or "") if record and photo_is_available(record.created_at) else "",
                        "litter_photo_url": photo_url_for(record.litter_photo_stored, record.created_at) if record else "",
                        "mortality_photo_name": (record.mortality_photo_name or "") if record and photo_is_available(record.created_at) else "",
                        "mortality_photo_url": photo_url_for(record.mortality_photo_stored, record.created_at) if record else "",
                        "power_cut_hours": record.power_cut_hours if record else None,
                        "dg_hours": record.dg_hours if record else None,
                        "issues": record.issues or "" if record else "",
                        "remarks": record.remarks or "" if record else "",
                    }
                )

            daily_groups.append(
                {
                    "entry_date": entry_date,
                    "shed_count": len([row for row in rows if row["has_entry"]]),
                    "rows": rows,
                }
            )

        hierarchy.append(
            {
                "farm_name": farmer.farm_name or "",
                "farmer_name": farmer.name or "",
                "farmer_code": farmer.farmer_code or "",
                "current_batch": farmer.active_batch or "",
                "bird_age_days": farmer.bird_age_days or 0,
                "cluster": farmer.cluster or "",
                "entry_count": entry_count,
                "latest_entry_date": latest_entry_date,
                "shed_count": len(default_sheds),
                "feed_stock_bags": feed_stock_totals.get(farmer.id, 0),
                "daily_groups": daily_groups[:10],
            }
        )
    return hierarchy


def summarize_owner_feed(records: list[FeedStock], db: Session) -> list[dict]:
    items = []
    for record in records:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.shed}",
                "value": f"{record.bags} bags",
                "note": record.feed_type,
            }
        )
    return items[:10]


def summarize_owner_health(
    medicine_records: list[MedicineStock],
    medicine_logs: list[MedicineLog],
    vaccine_records: list[VaccinationLog],
    db: Session,
) -> list[dict]:
    items: list[dict] = []
    for record in medicine_records[:5]:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.name}",
                "value": record.status,
                "note": f"{record.quantity} • {record.notes or 'No note'}",
            }
        )
    for record in medicine_logs[:5]:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.name}",
                "value": record.status,
                "note": f"{record.entry_date} • {record.quantity} • {record.notes or 'No note'}",
            }
        )
    for record in vaccine_records[:5]:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.vaccine}",
                "value": record.status,
                "note": f"{record.shed} • {record.entry_date}",
            }
        )
    return items[:10]


def summarize_owner_requests(requests: list[SupportRequest], db: Session) -> list[dict]:
    items: list[dict] = []
    for record in requests:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.request_type}",
                "value": record.status,
                "note": f"{record.entry_date} • {record.priority} • {record.details}",
            }
        )
    return items[:10]


def summarize_owner_issue_photos(records: list[IssuePhoto], db: Session) -> list[dict]:
    items: list[dict] = []
    for record in records:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.issue_type}",
                "value": record.status,
                "note": join_present(
                    [
                        record.entry_date,
                        record.shed,
                        record.priority,
                        "Photo expired" if not photo_is_available(record.created_at) else "",
                    ]
                ),
            }
        )
    return items[:10]


def summarize_owner_field_visits(records: list[FieldVisit], db: Session) -> list[dict]:
    items: list[dict] = []
    for record in records:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.visit_date}",
                "value": record.shed,
                "note": (
                    f"Mortality {record.mortality} • Avg wt {record.avg_weight_g} g • "
                    f"{record.action_taken or record.issue_summary or 'No action note'}"
                ),
            }
        )
    return items[:10]


def summarize_owner_documents(records: list[DocumentUpload], db: Session) -> list[dict]:
    items: list[dict] = []
    for record in records:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.doc_type}",
                "value": record.status,
                "note": f"{record.entry_date} • {record.title} • {record.amount or 'No amount'}",
                "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
            }
        )
    return items[:10]


def summarize_owner_operational_costs(records: list[OperationalCost], db: Session) -> list[dict]:
    items: list[dict] = []
    for record in records:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "label": f"{farmer.farm_name} / {record.expense_category}",
                "value": record.amount or "No amount",
                "note": join_present(
                    [
                        record.entry_date,
                        record.item_name,
                        record.shed,
                        record.vendor_name,
                        record.notes,
                    ]
                ),
                "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
            }
        )
    return items[:12]


def summarize_owner_sales(records: list[SaleRecord], db: Session) -> list[dict]:
    items: list[dict] = []
    for record in records:
        farmer = db.get(User, record.farmer_id)
        if not valid_farmer_user(farmer):
            continue
        items.append(
            {
                "sale_id": record.id,
                "label": f"{farmer.farm_name} / Bill {record.bill_number}",
                "value": compute_sale_amount_text(record.total_weight_kg, record.rate_per_kg, record.amount),
                "rate_per_kg": record.rate_per_kg or "",
                "total_weight_kg": record.total_weight_kg or "",
                "note": join_present(
                    [
                        record.entry_date,
                        record.party_name,
                        f"{record.total_weight_kg} kg",
                        f"Rate {record.rate_per_kg}/kg" if record.rate_per_kg else "",
                    ]
                ),
                "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
            }
        )
    return items[:12]


def parse_amount_value(raw_value: str | None) -> float:
    digits = re.sub(r"[^0-9.]", "", raw_value or "")
    if not digits:
        return 0.0
    try:
        return float(digits)
    except ValueError:
        return 0.0


def compute_sale_amount_value(total_weight_kg: str | None, rate_per_kg: str | None, amount: str | None) -> float:
    saved_amount = (amount or "").strip()
    if saved_amount and saved_amount.lower() != "amount pending":
        return parse_amount_value(saved_amount)
    weight_value = parse_amount_value(total_weight_kg)
    rate_value = parse_amount_value(rate_per_kg)
    if weight_value <= 0 or rate_value <= 0:
        return 0.0
    return weight_value * rate_value


def compute_sale_amount_text(total_weight_kg: str | None, rate_per_kg: str | None, amount: str | None) -> str:
    total_value = compute_sale_amount_value(total_weight_kg, rate_per_kg, amount)
    if total_value <= 0:
        return "Amount pending"
    formatted = f"{total_value:,.2f}".rstrip("0").rstrip(".")
    return f"Rs {formatted}"


def normalize_operational_cost_bucket(category: str | None) -> str:
    value = (category or "").strip().lower()
    if "chick" in value:
        return "Chicks amount"
    if "feed purchase" in value or value == "feed":
        return "Feed amount"
    if "feed transport" in value:
        return "Feed transport"
    if "medicine" in value or "supplement" in value:
        return "Medicine amount"
    if "vaccine" in value:
        return "Vaccine amount"
    if "diesel" in value or "fuel" in value:
        return "Diesel / fuel"
    if "labour" in value:
        return "Labour amount"
    if "litter" in value:
        return "Litter material"
    if "transport" in value or "logistics" in value:
        return "Transport / logistics"
    if "water" in value or "utility" in value:
        return "Water / utility"
    if "electric" in value:
        return "Electric repair"
    if "maintenance" in value:
        return "Maintenance"
    if "farm supply" in value:
        return "Farm supply"
    return "Other operational cost"


def summarize_operational_cost_breakdown(records: list[OperationalCost]) -> list[dict]:
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for record in records:
        bucket = normalize_operational_cost_bucket(record.expense_category)
        totals[bucket] = totals.get(bucket, 0.0) + parse_amount_value(record.amount)
        counts[bucket] = counts.get(bucket, 0) + 1
    ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    return [
        {
            "label": label,
            "value": f"Rs {value:,.0f}",
            "note": f"{counts.get(label, 0)} entries",
        }
        for label, value in ordered
    ]


def build_owner_file_library(
    farmers: list[User],
    documents: list[DocumentUpload],
    issue_photos: list[IssuePhoto],
    daily_entries: list[DailyEntry],
) -> list[dict]:
    documents_by_farmer: dict[int, list[dict]] = {}
    photos_by_farmer: dict[int, list[dict]] = {}

    for record in documents:
        documents_by_farmer.setdefault(record.farmer_id, []).append(
            {
                "entry_date": record.entry_date,
                "doc_type": record.doc_type,
                "title": record.title,
                "amount": record.amount or "",
                "notes": record.notes or "",
                "file_name": record.file_name,
                "file_url": f"/uploads/{record.stored_name}" if record.stored_name else "",
                "status": record.status,
            }
        )

    for record in issue_photos:
        if not photo_is_available(record.created_at):
            continue
        photos_by_farmer.setdefault(record.farmer_id, []).append(
            {
                "entry_date": record.entry_date,
                "kind": "Issue photo",
                "title": record.issue_type,
                "shed": record.shed,
                "priority": record.priority,
                "notes": record.notes or "",
                "file_name": record.file_name,
                "file_url": photo_url_for(record.stored_name, record.created_at),
            }
        )

    for record in daily_entries:
        photo_url = photo_url_for(record.litter_photo_stored, record.created_at)
        if not photo_url:
            pass
        else:
            photos_by_farmer.setdefault(record.farmer_id, []).append(
                {
                    "entry_date": record.entry_date,
                    "kind": "Litter photo",
                    "title": record.litter_condition or "Litter update",
                    "shed": record.shed,
                    "priority": "",
                    "notes": record.litter_notes or "",
                    "file_name": record.litter_photo_name or "",
                    "file_url": photo_url,
                }
            )
        mortality_photo_url = photo_url_for(record.mortality_photo_stored, record.created_at)
        if mortality_photo_url:
            photos_by_farmer.setdefault(record.farmer_id, []).append(
                {
                    "entry_date": record.entry_date,
                    "kind": "Mortality photo",
                    "title": f"Mortality {record.mortality}",
                    "shed": record.shed,
                    "priority": "",
                    "notes": record.issues or record.remarks or "",
                    "file_name": record.mortality_photo_name or "",
                    "file_url": mortality_photo_url,
                }
            )

    library: list[dict] = []
    for farmer in farmers:
        farm_documents = sorted(
            documents_by_farmer.get(farmer.id, []),
            key=lambda item: item["entry_date"],
            reverse=True,
        )
        farm_photos = sorted(
            photos_by_farmer.get(farmer.id, []),
            key=lambda item: item["entry_date"],
            reverse=True,
        )
        library.append(
            {
                "farm_name": farmer.farm_name or "",
                "farmer_name": farmer.name or "",
                "farmer_code": farmer.farmer_code or "",
                "cluster": farmer.cluster or "",
                "current_batch": farmer.active_batch or "",
                "documents_count": len(farm_documents),
                "photos_count": len(farm_photos),
                "documents": farm_documents,
                "photos": farm_photos,
            }
        )
    return library


def split_csv_text(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def party_matches_farmer(party: PartyContact, farmer: User) -> bool:
    farm_matches = split_csv_text(party.preferred_farms)
    cluster_matches = split_csv_text(party.preferred_clusters)
    if not farm_matches and not cluster_matches:
        return True
    farmer_farm = (farmer.farm_name or "").strip().lower()
    farmer_code = (farmer.farmer_code or "").strip().lower()
    farmer_cluster = (farmer.cluster or "").strip().lower()
    farm_ok = not farm_matches or any(match.lower() in {farmer_farm, farmer_code} for match in farm_matches)
    cluster_ok = not cluster_matches or any(match.lower() == farmer_cluster for match in cluster_matches)
    return farm_ok and cluster_ok


def get_sale_rule_map(db: Session, farmer_ids: list[int]) -> dict[int, SaleReadyRule]:
    if not farmer_ids:
        return {}
    rules = list(db.scalars(select(SaleReadyRule).where(SaleReadyRule.farmer_id.in_(farmer_ids))))
    return {rule.farmer_id: rule for rule in rules}


def build_sale_ready_queue(
    farmers: list[User],
    entries: list[DailyEntry],
    parties: list[PartyContact],
    rule_map: dict[int, SaleReadyRule],
) -> list[dict]:
    latest_by_farmer: dict[int, DailyEntry] = {}
    for entry in entries:
        if entry.farmer_id not in latest_by_farmer:
            latest_by_farmer[entry.farmer_id] = entry

    queue: list[dict] = []
    active_parties = [party for party in parties if party.is_active]
    for farmer in farmers:
        latest_entry = latest_by_farmer.get(farmer.id)
        rule = rule_map.get(farmer.id)
        if not latest_entry or not rule or not rule.ready_weight_g:
            continue
        if latest_entry.avg_weight_g < rule.ready_weight_g:
            continue
        matched_parties = [party for party in active_parties if party_matches_farmer(party, farmer)]
        message = (
            f"Birds are ready for sale at {farmer.farm_name or 'selected farm'}"
            f" ({farmer.farmer_code or '-'})"
            f" • Shed {latest_entry.shed or farmer.current_shed or '-'}"
            f" • Avg wt {latest_entry.avg_weight_g} g"
            f" • Batch {farmer.active_batch or '-'}."
        )
        queue.append(
            {
                "label": farmer.farm_name or "-",
                "value": f"{latest_entry.avg_weight_g} g",
                "note": join_present(
                    [
                        farmer.farmer_code or "",
                        latest_entry.shed or farmer.current_shed or "",
                        f"{len(matched_parties)} parties",
                        "WhatsApp ready" if rule.auto_whatsapp_enabled else "Manual share",
                    ]
                ),
                "farmer_code": farmer.farmer_code or "",
                "farm_name": farmer.farm_name or "",
                "farmer_name": farmer.name or "",
                "current_shed": latest_entry.shed or farmer.current_shed or "",
                "avg_weight_g": latest_entry.avg_weight_g,
                "ready_weight_g": rule.ready_weight_g,
                "auto_whatsapp_enabled": rule.auto_whatsapp_enabled,
                "message_preview": message,
                "parties": [
                    {
                        "name": party.name,
                        "phone": format_phone_display(party.phone),
                        "market_area": party.market_area or "",
                    }
                    for party in matched_parties
                ],
            }
        )
    return queue


def trigger_sale_ready_whatsapp(db: Session, farmer: User, entry: DailyEntry) -> list[dict]:
    rule = db.scalar(select(SaleReadyRule).where(SaleReadyRule.farmer_id == farmer.id))
    if not rule or not rule.auto_whatsapp_enabled or not rule.ready_weight_g:
        return []
    if entry.avg_weight_g < rule.ready_weight_g:
        return []

    parties = [party for party in db.scalars(select(PartyContact).where(PartyContact.is_active == True).order_by(PartyContact.name))]
    matched_parties = [party for party in parties if party_matches_farmer(party, farmer)]
    if not matched_parties:
        return []

    dispatch_results: list[dict] = []
    message_text = make_sale_ready_message(farmer, entry, rule)
    for party in matched_parties:
        existing_dispatch = db.scalar(
            select(SaleAlertDispatch).where(
                SaleAlertDispatch.daily_entry_id == entry.id,
                SaleAlertDispatch.party_id == party.id,
                SaleAlertDispatch.channel == "whatsapp",
            )
        )
        if existing_dispatch:
            dispatch_results.append(
                {
                    "party_name": party.name,
                    "phone": format_phone_display(party.phone),
                    "status": existing_dispatch.status,
                    "sent": existing_dispatch.status == "sent",
                }
            )
            continue

        status = "pending_setup"
        external_message_id = None
        if whatsapp_ready():
            try:
                response_payload = send_whatsapp_template_message(
                    party.phone,
                    [
                        farmer.farm_name or "-",
                        entry.shed or farmer.current_shed or "-",
                        str(entry.avg_weight_g),
                        farmer.active_batch or "-",
                    ],
                )
                messages = response_payload.get("messages") or []
                external_message_id = messages[0].get("id") if messages else None
                status = "sent"
            except Exception as error:
                logger.exception("whatsapp_sale_alert_failed farmer=%s party=%s", farmer.farmer_code, party.phone)
                status = f"failed: {str(error)[:120]}"

        dispatch = SaleAlertDispatch(
            daily_entry_id=entry.id,
            farmer_id=farmer.id,
            party_id=party.id,
            channel="whatsapp",
            status=status,
            external_message_id=external_message_id,
            message_text=message_text,
        )
        db.add(dispatch)
        dispatch_results.append(
            {
                "party_name": party.name,
                "phone": format_phone_display(party.phone),
                "status": status,
                "sent": status == "sent",
            }
        )
    return dispatch_results


def current_cycle_entries(db: Session, farmer_id: int) -> list[DailyEntry]:
    return list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id == farmer_id).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())))


def latest_date_entries(entries: list[DailyEntry]) -> list[DailyEntry]:
    if not entries:
        return []
    latest_date = entries[0].entry_date
    return [item for item in entries if item.entry_date == latest_date]


def valid_farmer_user(user: User) -> bool:
    return bool(user and user.role == "farmer" and user.phone and user.farmer_code and user.name and user.farm_name)


def valid_field_user(user: User) -> bool:
    return bool(user and user.role == "field" and user.phone and not is_placeholder_field_phone(user.phone) and user.name)


def join_present(parts: list[str]) -> str:
    return " • ".join([part for part in parts if part])


def farmer_seed_bundles(seed_data: dict) -> list[dict]:
    if "farmers" in seed_data:
        return seed_data["farmers"]
    return [
        {
            "profile": seed_data.get("profile", {}),
            "daily_entries": seed_data.get("daily_entries", []),
            "feed_stock": seed_data.get("feed_stock", []),
            "feed_inward": seed_data.get("feed_inward", []),
            "mortality_log": seed_data.get("mortality_log", []),
            "medicine_stock": seed_data.get("medicine_stock", []),
            "medicine_log": seed_data.get("medicine_log", []),
            "vaccination_log": seed_data.get("vaccination_log", []),
            "requests": seed_data.get("requests", []),
            "documents": seed_data.get("documents", []),
            "issue_photos": seed_data.get("issue_photos", []),
            "field_visits": seed_data.get("field_visits", []),
        }
    ]


def create_farmer_user(profile: dict) -> User:
    normalized_phone = normalize_phone(profile.get("phone", ""))
    if not normalized_phone:
        raise ValueError("Farmer seed profile requires a phone number.")
    farmer_name = (profile.get("farmer_name", "") or "").strip()
    if not farmer_name:
        raise ValueError("Farmer seed profile requires a farmer name.")
    return User(
        role="farmer",
        name=farmer_name,
        phone=normalized_phone,
        password_hash=hash_password(profile.get("password", os.getenv("FARMER_APP_DEFAULT_PASSWORD", "changeme"))),
        cluster=profile.get("cluster", ""),
        farm_name=profile.get("farm_name", ""),
        farmer_code=profile.get("farmer_code", ""),
        active_batch=profile.get("active_batch", ""),
        bird_age_days=profile.get("bird_age_days", 0),
        field_officer=profile.get("field_officer", ""),
        farm_capacity=profile.get("farm_capacity", ""),
        active_sheds=profile.get("active_sheds", 1),
    )


def ensure_field_officer_by_values(
    db: Session,
    officer_name: str,
    cluster: str,
    officer_phone: str = "",
    officer_password: str = "",
) -> User | None:
    officer_name = (officer_name or "").strip()
    officer_phone = normalize_phone(officer_phone or os.getenv("FIELD_APP_DEFAULT_PHONE", ""))
    if not officer_name and not officer_phone:
        return None
    if officer_phone:
        officer = db.scalar(select(User).where(User.role == "field", User.phone == officer_phone))
        if officer:
            return officer
    if officer_name:
        officer = db.scalar(select(User).where(User.role == "field", User.name == officer_name))
        if officer:
            return officer

    if not officer_phone:
        base_identifier = f"field::{slug_text(officer_name)}::{slug_text(cluster)}"
        officer_phone = base_identifier
        suffix = 1
        while db.scalar(select(User).where(User.role == "field", User.phone == officer_phone)):
            suffix += 1
            officer_phone = f"{base_identifier}-{suffix}"

    officer = User(
        role="field",
        name=officer_name or officer_phone,
        phone=officer_phone,
        password_hash=hash_password(officer_password or os.getenv("FIELD_APP_DEFAULT_PASSWORD", "changeme")),
        cluster=cluster or "",
        title="Field Officer",
    )
    db.add(officer)
    db.flush()
    return officer


def ensure_field_officer(db: Session, profile: dict) -> User | None:
    return ensure_field_officer_by_values(
        db,
        officer_name=profile.get("field_officer", ""),
        cluster=profile.get("cluster", ""),
        officer_phone=profile.get("field_officer_phone", ""),
        officer_password=profile.get("field_officer_password", ""),
    )


def seed_farmer_records(db: Session, farmer: User, officer: User | None, bundle: dict) -> None:
    if not db.scalar(select(func.count(DailyEntry.id)).where(DailyEntry.farmer_id == farmer.id)):
        for item in bundle.get("daily_entries", []):
            db.add(DailyEntry(farmer_id=farmer.id, entry_date=item["date"], shed=item["shed"], opening_birds=item["opening_birds"], mortality=item["mortality"], culls=item["culls"], feed_used_bags=item["feed_used_bags"], water_liters=item["water_liters"], avg_weight_g=item["avg_weight_g"], temperature_c=item["temperature_c"], humidity_pct=item["humidity_pct"], litter_condition=item["litter_condition"], power_cut_hours=item["power_cut_hours"], dg_hours=item["dg_hours"], uniformity_pct=item["uniformity_pct"], issues=item.get("issues", ""), remarks=item.get("remarks", "")))
    if not db.scalar(select(func.count(FeedStock.id)).where(FeedStock.farmer_id == farmer.id)):
        for item in bundle.get("feed_stock", []):
            db.add(FeedStock(farmer_id=farmer.id, shed=item["shed"], feed_type=item["feed_type"], bags=item["bags"]))
    if not db.scalar(select(func.count(FeedInward.id)).where(FeedInward.farmer_id == farmer.id)):
        for item in bundle.get("feed_inward", []):
            db.add(FeedInward(farmer_id=farmer.id, inward_date=item["date"], feed_type=item["feed_type"], bags=item["bags"], shed=item["shed"]))
    if not db.scalar(select(func.count(MortalityLog.id)).where(MortalityLog.farmer_id == farmer.id)):
        for item in bundle.get("mortality_log", []):
            db.add(MortalityLog(farmer_id=farmer.id, entry_date=item["date"], shed=item["shed"], birds=item["birds"], notes=item.get("notes", "")))
    if not db.scalar(select(func.count(MedicineStock.id)).where(MedicineStock.farmer_id == farmer.id)):
        for item in bundle.get("medicine_stock", []):
            db.add(MedicineStock(farmer_id=farmer.id, name=item["name"], status=item["status"], quantity=item["quantity"], notes=item.get("notes", "")))
    if not db.scalar(select(func.count(MedicineLog.id)).where(MedicineLog.farmer_id == farmer.id)):
        for item in bundle.get("medicine_log", []):
            db.add(MedicineLog(farmer_id=farmer.id, entry_date=item["date"], name=item["name"], status=item["status"], quantity=item["quantity"], notes=item.get("notes", "")))
    if not db.scalar(select(func.count(VaccinationLog.id)).where(VaccinationLog.farmer_id == farmer.id)):
        for item in bundle.get("vaccination_log", []):
            db.add(VaccinationLog(farmer_id=farmer.id, entry_date=item["date"], shed=item["shed"], vaccine=item["vaccine"], status=item["status"], notes=item.get("notes", "")))
    if not db.scalar(select(func.count(SupportRequest.id)).where(SupportRequest.farmer_id == farmer.id)):
        for item in bundle.get("requests", []):
            db.add(SupportRequest(farmer_id=farmer.id, entry_date=item["date"], request_type=item["type"], priority=item["priority"], details=item["details"], status=item["status"]))
    if not db.scalar(select(func.count(DocumentUpload.id)).where(DocumentUpload.farmer_id == farmer.id)):
        for item in bundle.get("documents", []):
            db.add(DocumentUpload(farmer_id=farmer.id, entry_date=item["date"], doc_type=item["type"], title=item["title"], amount=item.get("amount", ""), notes=item.get("notes", ""), file_name=item["file_name"], stored_name=item.get("stored_name", ""), status=item["status"]))
    if not db.scalar(select(func.count(IssuePhoto.id)).where(IssuePhoto.farmer_id == farmer.id)):
        for item in bundle.get("issue_photos", []):
            db.add(IssuePhoto(farmer_id=farmer.id, entry_date=item["date"], issue_type=item["issue_type"], shed=item["shed"], priority=item["priority"], notes=item.get("notes", ""), file_name=item["file_name"], stored_name=item.get("stored_name", ""), status=item["status"]))
    if officer and not db.scalar(select(func.count(FieldVisit.id)).where(FieldVisit.farmer_id == farmer.id)):
        for item in bundle.get("field_visits", []):
            db.add(
                FieldVisit(
                    officer_id=officer.id,
                    farmer_id=farmer.id,
                    visit_date=item["visit_date"],
                    shed=item["shed"],
                    avg_weight_g=item["avg_weight_g"],
                    mortality=item["mortality"],
                    feed_stock_note=item.get("feed_stock_note", ""),
                    medicine_note=item.get("medicine_note", ""),
                    issue_summary=item.get("issue_summary", ""),
                    action_taken=item.get("action_taken", ""),
                )
            )


def seed_database_from_json() -> None:
    seed_data = json.loads(DATA_FILE.read_text()) if DATA_FILE.exists() else {}
    bundles = farmer_seed_bundles(seed_data)
    profile = bundles[0].get("profile", {}) if bundles else {}
    owner_phone_value = normalize_phone(os.getenv("OWNER_APP_DEFAULT_PHONE", ""))
    owner_name_value = os.getenv("OWNER_APP_DEFAULT_NAME", "").strip()
    owner_password_value = os.getenv("OWNER_APP_DEFAULT_PASSWORD", "").strip()
    with session_scope() as db:
        existing = db.scalar(select(func.count(User.id)))
        if existing:
            owner = db.scalar(select(User).where(User.role == "owner"))
            if not owner and owner_phone_value and owner_password_value:
                db.add(
                    User(
                        role="owner",
                        name=owner_name_value or "Owner",
                        phone=owner_phone_value,
                        password_hash=hash_password(owner_password_value),
                        cluster=profile.get("cluster", ""),
                        title="Owner",
                    )
                )
            for bundle in bundles:
                farmer_profile = bundle.get("profile", {})
                normalized_farmer_phone = normalize_phone(farmer_profile.get("phone", ""))
                if not normalized_farmer_phone:
                    continue
                farmer = db.scalar(select(User).where(User.role == "farmer", User.phone == normalized_farmer_phone))
                if not farmer and farmer_profile.get("farmer_code"):
                    farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == farmer_profile.get("farmer_code")))
                if not farmer:
                    farmer = create_farmer_user(farmer_profile)
                    db.add(farmer)
                    db.flush()
                officer = ensure_field_officer(db, farmer_profile)
                seed_farmer_records(db, farmer, officer, bundle)
            db.commit()
            return

        if not owner_phone_value or not owner_password_value:
            db.commit()
            return

        owner = User(
            role="owner",
            name=owner_name_value or "Owner",
            phone=owner_phone_value,
            password_hash=hash_password(owner_password_value),
            cluster=profile.get("cluster", ""),
            title="Owner",
        )
        db.add(owner)
        db.flush()
        for bundle in bundles:
            farmer_profile = bundle.get("profile", {})
            if not normalize_phone(farmer_profile.get("phone", "")):
                continue
            farmer = create_farmer_user(farmer_profile)
            db.add(farmer)
            db.flush()
            officer = ensure_field_officer(db, farmer_profile)
            seed_farmer_records(db, farmer, officer, bundle)
        db.commit()


def purge_legacy_demo_data() -> None:
    with session_scope() as db:
        demo_farmers = list(
            db.scalars(
                select(User).where(
                    User.role == "farmer",
                    or_(
                        User.phone.in_(LEGACY_DEMO_FARMER_PHONES),
                        User.farmer_code.in_(LEGACY_DEMO_FARMER_CODES),
                        User.phone == "",
                    ),
                )
            )
        )
        farmer_ids = [user.id for user in demo_farmers]
        if farmer_ids:
            db.execute(delete(DailyEntry).where(DailyEntry.farmer_id.in_(farmer_ids)))
            db.execute(delete(FeedStock).where(FeedStock.farmer_id.in_(farmer_ids)))
            db.execute(delete(FeedInward).where(FeedInward.farmer_id.in_(farmer_ids)))
            db.execute(delete(MortalityLog).where(MortalityLog.farmer_id.in_(farmer_ids)))
            db.execute(delete(MedicineStock).where(MedicineStock.farmer_id.in_(farmer_ids)))
            db.execute(delete(MedicineLog).where(MedicineLog.farmer_id.in_(farmer_ids)))
            db.execute(delete(VaccinationLog).where(VaccinationLog.farmer_id.in_(farmer_ids)))
            db.execute(delete(SupportRequest).where(SupportRequest.farmer_id.in_(farmer_ids)))
            db.execute(delete(DocumentUpload).where(DocumentUpload.farmer_id.in_(farmer_ids)))
            db.execute(delete(IssuePhoto).where(IssuePhoto.farmer_id.in_(farmer_ids)))
            db.execute(delete(FieldVisit).where(FieldVisit.farmer_id.in_(farmer_ids)))
            db.execute(delete(User).where(User.id.in_(farmer_ids)))

        invalid_farmers = [
            user
            for user in db.scalars(select(User).where(User.role == "farmer"))
            if not valid_farmer_user(user)
        ]
        invalid_farmer_ids = [user.id for user in invalid_farmers]
        if invalid_farmer_ids:
            db.execute(delete(DailyEntry).where(DailyEntry.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(FeedStock).where(FeedStock.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(FeedInward).where(FeedInward.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(MortalityLog).where(MortalityLog.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(MedicineStock).where(MedicineStock.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(MedicineLog).where(MedicineLog.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(VaccinationLog).where(VaccinationLog.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(SupportRequest).where(SupportRequest.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(DocumentUpload).where(DocumentUpload.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(IssuePhoto).where(IssuePhoto.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(FieldVisit).where(FieldVisit.farmer_id.in_(invalid_farmer_ids)))
            db.execute(delete(User).where(User.id.in_(invalid_farmer_ids)))

        demo_field_officers = list(
            db.scalars(
                select(User).where(
                    User.role == "field",
                    or_(
                        User.phone.in_(LEGACY_DEMO_FIELD_PHONES),
                        User.phone == "",
                    ),
                )
            )
        )
        field_ids = [user.id for user in demo_field_officers]
        if field_ids:
            db.execute(delete(FieldVisit).where(FieldVisit.officer_id.in_(field_ids)))
            db.execute(delete(User).where(User.id.in_(field_ids)))

        placeholder_field_users = list(
            db.scalars(select(User).where(User.role == "field"))
        )
        placeholder_field_ids = [user.id for user in placeholder_field_users if is_placeholder_field_phone(user.phone)]
        if placeholder_field_ids:
            db.execute(delete(FieldVisit).where(FieldVisit.officer_id.in_(placeholder_field_ids)))
            db.execute(delete(User).where(User.id.in_(placeholder_field_ids)))

        invalid_field_users = [
            user
            for user in db.scalars(select(User).where(User.role == "field"))
            if not valid_field_user(user)
        ]
        invalid_field_ids = [user.id for user in invalid_field_users]
        if invalid_field_ids:
            db.execute(delete(FieldVisit).where(FieldVisit.officer_id.in_(invalid_field_ids)))
            db.execute(delete(User).where(User.id.in_(invalid_field_ids)))

        db.commit()


def init_database() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        if engine.dialect.name == "sqlite":
            existing_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(users)"))}
            if "current_shed" not in existing_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN current_shed VARCHAR(40)"))
            if "initial_batch_strength" not in existing_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN initial_batch_strength INTEGER"))
            daily_entry_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(daily_entries)"))}
            if "litter_notes" not in daily_entry_columns:
                connection.execute(text("ALTER TABLE daily_entries ADD COLUMN litter_notes TEXT DEFAULT ''"))
            if "litter_photo_name" not in daily_entry_columns:
                connection.execute(text("ALTER TABLE daily_entries ADD COLUMN litter_photo_name VARCHAR(200)"))
            if "litter_photo_stored" not in daily_entry_columns:
                connection.execute(text("ALTER TABLE daily_entries ADD COLUMN litter_photo_stored VARCHAR(240)"))
            if "mortality_photo_name" not in daily_entry_columns:
                connection.execute(text("ALTER TABLE daily_entries ADD COLUMN mortality_photo_name VARCHAR(200)"))
            if "mortality_photo_stored" not in daily_entry_columns:
                connection.execute(text("ALTER TABLE daily_entries ADD COLUMN mortality_photo_stored VARCHAR(240)"))
            sale_record_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(sale_records)"))}
            if "rate_per_kg" not in sale_record_columns:
                connection.execute(text("ALTER TABLE sale_records ADD COLUMN rate_per_kg VARCHAR(80) DEFAULT ''"))
        else:
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_shed VARCHAR(40)"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS initial_batch_strength INTEGER"))
            connection.execute(text("ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS litter_notes TEXT DEFAULT ''"))
            connection.execute(text("ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS litter_photo_name VARCHAR(200)"))
            connection.execute(text("ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS litter_photo_stored VARCHAR(240)"))
            connection.execute(text("ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS mortality_photo_name VARCHAR(200)"))
            connection.execute(text("ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS mortality_photo_stored VARCHAR(240)"))
            connection.execute(text("ALTER TABLE sale_records ADD COLUMN IF NOT EXISTS rate_per_kg VARCHAR(80) DEFAULT ''"))
            connection.execute(text("ALTER TABLE daily_entries ALTER COLUMN feed_used_bags TYPE DOUBLE PRECISION USING feed_used_bags::double precision"))
    purge_legacy_demo_data()
    seed_database_from_json()
    maybe_run_go_live_reset()
    maybe_run_owner_account_sync()


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


def remove_file_if_exists(stored_name: str | None):
    if not stored_name:
        return
    file_path = UPLOADS_DIR / stored_name
    if file_path.exists():
        file_path.unlink()


def purge_expired_photo_uploads(db: Session):
    cutoff = photo_retention_cutoff()
    changed = False

    expired_daily_entries = list(
        db.scalars(
            select(DailyEntry).where(
                DailyEntry.litter_photo_stored.is_not(None),
                DailyEntry.created_at < cutoff,
            )
        )
    )
    for record in expired_daily_entries:
        remove_file_if_exists(record.litter_photo_stored)
        remove_file_if_exists(record.mortality_photo_stored)
        if record.litter_photo_name or record.litter_photo_stored:
            record.litter_photo_name = None
            record.litter_photo_stored = None
            changed = True
        if record.mortality_photo_name or record.mortality_photo_stored:
            record.mortality_photo_name = None
            record.mortality_photo_stored = None
            changed = True

    expired_issue_photos = list(
        db.scalars(select(IssuePhoto).where(IssuePhoto.created_at < cutoff))
    )
    for record in expired_issue_photos:
        remove_file_if_exists(record.stored_name)
        db.delete(record)
        changed = True

    if changed:
        db.commit()


def file_response_for_upload(file_name: str, db: Session) -> FileResponse:
    purge_expired_photo_uploads(db)
    file_path = UPLOADS_DIR / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Not Found")

    document_record = db.scalar(select(DocumentUpload).where(DocumentUpload.stored_name == file_name))
    if document_record:
        return FileResponse(file_path)

    operational_cost_record = db.scalar(select(OperationalCost).where(OperationalCost.stored_name == file_name))
    if operational_cost_record:
        return FileResponse(file_path)

    sale_record = db.scalar(select(SaleRecord).where(SaleRecord.stored_name == file_name))
    if sale_record:
        return FileResponse(file_path)

    litter_record = db.scalar(select(DailyEntry).where(DailyEntry.litter_photo_stored == file_name))
    if litter_record and photo_is_available(litter_record.created_at):
        return FileResponse(file_path)

    mortality_record = db.scalar(select(DailyEntry).where(DailyEntry.mortality_photo_stored == file_name))
    if mortality_record and photo_is_available(mortality_record.created_at):
        return FileResponse(file_path)

    issue_record = db.scalar(select(IssuePhoto).where(IssuePhoto.stored_name == file_name))
    if issue_record and photo_is_available(issue_record.created_at):
        return FileResponse(file_path)

    raise HTTPException(status_code=404, detail="Not Found")


for route_path, file_name in WEBSITE_FILES.items():
    app.add_api_route(route_path, lambda file_name=file_name: public_file_response(file_name), methods=["GET"])


@app.on_event("startup")
def on_startup() -> None:
    init_database()
    with session_scope() as db:
        purge_expired_photo_uploads(db)


@app.get("/uploads/{file_name:path}")
def get_upload(file_name: str):
    with session_scope() as db:
        return file_response_for_upload(file_name, db)


@app.api_route("/api/health", methods=["GET", "HEAD"])
def healthcheck():
    return {
        "status": "ok",
        "database": DATABASE_URL.split("://", 1)[0],
    }


@app.post("/api/auth/login")
def auth_login(payload: LoginPayload, request: Request):
    normalized_phone = normalize_phone(payload.phone)
    with session_scope() as db:
        user = db.scalar(select(User).where(User.phone == normalized_phone, User.role == payload.role))
        password_ok = bool(user and user.password_hash == hash_password(payload.password))
        logger.info(
            "login_attempt role=%s input_phone=%s normalized_phone=%s user_found=%s user_id=%s stored_phone=%s password_ok=%s",
            payload.role,
            payload.phone,
            normalized_phone,
            bool(user),
            user.id if user else None,
            user.phone if user else None,
            password_ok,
        )
        if not user or not password_ok:
            raise HTTPException(status_code=401, detail="Invalid credentials.")
        request.session["user_id"] = user.id
        request.session["role"] = user.role
        request.session["name"] = user.name
        request.session["last_seen_at"] = datetime.utcnow().isoformat()
        response = JSONResponse(
            {
                "success": True,
                "role": user.role,
                "user": serialize_profile(user),
                "redirect": (
                    "/farmer-app/dashboard.html"
                    if user.role == "farmer"
                    else "/field-app/dashboard.html"
                    if user.role == "field"
                    else "/owner-app/dashboard.html"
                ),
            }
        )
        set_role_auth_cookie(response, user)
        return response


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    request.session.clear()
    response = JSONResponse({"success": True})
    clear_role_auth_cookies(response)
    return response


@app.get("/api/auth/session")
def auth_session(request: Request):
    cookie_identity = read_role_cookie_identity(request, expected_role_from_request(request))
    user_id = (cookie_identity or {}).get("user_id") or request.session.get("user_id")
    role = (cookie_identity or {}).get("role") or request.session.get("role")
    if not user_id or not role:
        raise HTTPException(status_code=401, detail="No active session.")
    with session_scope() as db:
        user = db.get(User, int(user_id))
        if not user:
            request.session.clear()
            raise HTTPException(status_code=401, detail="Session expired.")
        request.session["last_seen_at"] = datetime.utcnow().isoformat()
        return {"authenticated": True, "role": user.role, "user": serialize_profile(user)}


@app.get("/api/farmer/profile")
def farmer_profile(request: Request):
    user = get_current_user(request, "farmer")
    return serialize_profile(user)


@app.put("/api/farmer/profile")
def farmer_update_profile(payload: FarmerProfileUpdatePayload, request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.id == user.id, User.role == "farmer"))
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found.")

        normalized_phone = normalize_phone(payload.phone)
        existing_phone = db.scalar(select(User).where(User.phone == normalized_phone, User.id != farmer.id))
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone number already exists.")

        farmer.name = payload.farmer_name
        farmer.phone = normalized_phone
        if payload.password.strip():
            farmer.password_hash = hash_password(payload.password)
        farmer.cluster = payload.cluster
        farmer.farm_name = payload.farm_name
        farmer.field_officer = payload.field_officer
        farmer.farm_capacity = payload.farm_capacity
        farmer.active_sheds = payload.active_sheds
        db.add(farmer)
        db.commit()
        db.refresh(farmer)

    request.session["user_id"] = farmer.id
    request.session["role"] = farmer.role
    request.session["last_seen_at"] = datetime.utcnow().isoformat()
    return {"success": True, "profile": serialize_profile(farmer)}


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
                {"label": "Feed used", "value": format_feed_usage(latest_entry.feed_used_bags), "note": "Daily feed consumption"},
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
        "outside_weather": get_outside_weather(user),
        "shed_defaults": make_shed_defaults(entries),
        "entry_history": make_daily_entry_history(entries),
        "entry_records": [serialize_daily_entry_record(entry) for entry in entries[:12]],
        "vaccine_history": make_vaccine_history(vaccines),
    }


@app.post("/api/farmer/daily-entry")
async def add_daily_entry(
    request: Request,
    entry_date: str | None = Form(None),
    shed: str | None = Form(None),
    opening_birds: int | None = Form(None),
    mortality: int = Form(...),
    culls: int = Form(...),
    feed_used_bags: float = Form(0),
    water_liters: int = Form(0),
    avg_weight_g: int = Form(0),
    temperature_c: float = Form(0),
    humidity_pct: int = Form(0),
    litter_condition: str = Form(""),
    litter_notes: str = Form(""),
    litter_photo: UploadFile | None = File(None),
    mortality_photo: UploadFile | None = File(None),
    power_cut_hours: float = Form(0),
    dg_hours: float = Form(0),
    uniformity_pct: int = Form(0),
    issues: str = Form(""),
    remarks: str = Form(""),
):
    user = get_current_user(request, "farmer")
    entry_date = (entry_date or "").strip() or today_string()
    shed = (shed or "").strip() or user.current_shed or "Shed 1"
    litter_condition = (litter_condition or "").strip()
    litter_photo_name = None
    litter_photo_stored = None
    if litter_photo and litter_photo.filename:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original_name = litter_photo.filename
        suffix = Path(original_name).suffix or ".bin"
        stored_name = f"{timestamp}-{safe_slug(f'litter-{shed}-{entry_date}')}{suffix}"
        destination = UPLOADS_DIR / stored_name
        destination.write_bytes(await litter_photo.read())
        litter_photo_name = original_name
        litter_photo_stored = stored_name
    mortality_photo_name = None
    mortality_photo_stored = None
    if mortality_photo and mortality_photo.filename:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original_name = mortality_photo.filename
        suffix = Path(original_name).suffix or ".bin"
        stored_name = f"{timestamp}-{safe_slug(f'mortality-{shed}-{entry_date}')}{suffix}"
        destination = UPLOADS_DIR / stored_name
        destination.write_bytes(await mortality_photo.read())
        mortality_photo_name = original_name
        mortality_photo_stored = stored_name
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.id == user.id, User.role == "farmer"))
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found.")
        opening_birds = resolve_opening_birds_for_entry(db, farmer, shed, entry_date)
        record = DailyEntry(
            farmer_id=user.id,
            entry_date=entry_date,
            shed=shed,
            opening_birds=opening_birds,
            mortality=mortality,
            culls=culls,
            feed_used_bags=feed_used_bags,
            water_liters=water_liters,
            avg_weight_g=avg_weight_g,
            temperature_c=temperature_c,
            humidity_pct=humidity_pct,
            litter_condition=litter_condition,
            litter_notes=litter_notes,
            litter_photo_name=litter_photo_name,
            litter_photo_stored=litter_photo_stored,
            mortality_photo_name=mortality_photo_name,
            mortality_photo_stored=mortality_photo_stored,
            power_cut_hours=power_cut_hours,
            dg_hours=dg_hours,
            uniformity_pct=uniformity_pct,
            issues=issues,
            remarks=remarks,
        )
        db.add(record)
        db.add(MortalityLog(farmer_id=user.id, entry_date=entry_date, shed=shed, birds=mortality, notes=issues or "Daily entry"))
        db.flush()
        sale_ready_dispatch = trigger_sale_ready_whatsapp(db, farmer, record) if farmer else []
        db.commit()
        db.refresh(record)
    return {"success": True, "record": {"id": record.id}, "sale_ready_dispatch": sale_ready_dispatch}


@app.put("/api/farmer/daily-entry/{entry_id}")
async def update_daily_entry(
    entry_id: int,
    request: Request,
    entry_date: str | None = Form(None),
    shed: str | None = Form(None),
    opening_birds: int | None = Form(None),
    mortality: int = Form(...),
    culls: int = Form(...),
    feed_used_bags: float = Form(0),
    water_liters: int = Form(0),
    avg_weight_g: int = Form(0),
    temperature_c: float = Form(0),
    humidity_pct: int = Form(0),
    litter_condition: str = Form(""),
    litter_notes: str = Form(""),
    litter_photo: UploadFile | None = File(None),
    mortality_photo: UploadFile | None = File(None),
    power_cut_hours: float = Form(0),
    dg_hours: float = Form(0),
    uniformity_pct: int = Form(0),
    issues: str = Form(""),
    remarks: str = Form(""),
):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        record = db.scalar(select(DailyEntry).where(DailyEntry.id == entry_id, DailyEntry.farmer_id == user.id))
        if not record:
            raise HTTPException(status_code=404, detail="Daily entry not found.")
        entry_date = (entry_date or "").strip() or today_string()
        shed = (shed or "").strip() or record.shed or user.current_shed or "Shed 1"
        litter_condition = (litter_condition or "").strip()
        if record.entry_date != today_string():
            raise HTTPException(status_code=403, detail="Previous day entries cannot be edited.")
        if entry_date != today_string():
            raise HTTPException(status_code=403, detail="Only today's entry can be updated.")

        if litter_photo and litter_photo.filename:
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            original_name = litter_photo.filename
            suffix = Path(original_name).suffix or ".bin"
            stored_name = f"{timestamp}-{safe_slug(f'litter-{shed}-{entry_date}')}{suffix}"
            destination = UPLOADS_DIR / stored_name
            destination.write_bytes(await litter_photo.read())
            record.litter_photo_name = original_name
            record.litter_photo_stored = stored_name

        if mortality_photo and mortality_photo.filename:
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            original_name = mortality_photo.filename
            suffix = Path(original_name).suffix or ".bin"
            stored_name = f"{timestamp}-{safe_slug(f'mortality-{shed}-{entry_date}')}{suffix}"
            destination = UPLOADS_DIR / stored_name
            destination.write_bytes(await mortality_photo.read())
            record.mortality_photo_name = original_name
            record.mortality_photo_stored = stored_name

        next_opening_birds = (
            record.opening_birds
            if entry_date == record.entry_date and shed == record.shed
            else resolve_opening_birds_for_entry(db, user, shed, entry_date, exclude_entry_id=record.id)
        )

        record.entry_date = entry_date
        record.shed = shed
        record.opening_birds = next_opening_birds
        record.mortality = mortality
        record.culls = culls
        record.feed_used_bags = feed_used_bags
        record.water_liters = water_liters
        record.avg_weight_g = avg_weight_g
        record.temperature_c = temperature_c
        record.humidity_pct = humidity_pct
        record.litter_condition = litter_condition
        record.litter_notes = litter_notes
        record.power_cut_hours = power_cut_hours
        record.dg_hours = dg_hours
        record.uniformity_pct = uniformity_pct
        record.issues = issues
        record.remarks = remarks

        mortality_log = db.scalar(
            select(MortalityLog)
            .where(
                MortalityLog.farmer_id == user.id,
                MortalityLog.entry_date == record.entry_date,
                MortalityLog.shed == record.shed,
            )
            .order_by(MortalityLog.created_at.desc())
        )
        if mortality_log:
            mortality_log.birds = mortality
            mortality_log.notes = issues or "Daily entry"

        db.add(record)
        farmer = db.scalar(select(User).where(User.id == user.id, User.role == "farmer"))
        sale_ready_dispatch = trigger_sale_ready_whatsapp(db, farmer, record) if farmer else []
        db.commit()
        db.refresh(record)
    return {"success": True, "record": {"id": record.id}, "sale_ready_dispatch": sale_ready_dispatch}


@app.get("/api/farmer/feed")
def farmer_feed(request: Request):
    user = get_current_user(request, "farmer")
    with session_scope() as db:
        stock = list(db.scalars(select(FeedStock).where(FeedStock.farmer_id == user.id)))
        inward = list(db.scalars(select(FeedInward).where(FeedInward.farmer_id == user.id).order_by(FeedInward.inward_date.desc(), FeedInward.created_at.desc())))
        entries = current_cycle_entries(db, user.id)
    return {
        "profile": serialize_profile(user),
        "expected_feed_metrics": build_expected_feed_metrics(user, entries),
        "shed_balances": make_feed_balances(stock),
        "inward_history": make_feed_history(inward),
    }


@app.post("/api/farmer/feed/balance")
def update_feed_balance(payload: FeedBalancePayload, request: Request):
    user = get_current_user(request, "farmer")
    shed = (payload.shed or "").strip() or user.current_shed or ""
    with session_scope() as db:
        record = db.scalar(select(FeedStock).where(FeedStock.farmer_id == user.id, FeedStock.shed == shed, FeedStock.feed_type == payload.feed_type))
        if record:
            record.bags = payload.bags
        else:
            db.add(FeedStock(farmer_id=user.id, shed=shed, feed_type=payload.feed_type, bags=payload.bags))
        db.commit()
    return {"success": True}


@app.post("/api/farmer/feed/inward")
def add_feed_inward(payload: FeedInwardPayload, request: Request):
    user = get_current_user(request, "farmer")
    shed = (payload.shed or "").strip() or user.current_shed or ""
    with session_scope() as db:
        db.add(FeedInward(farmer_id=user.id, inward_date=payload.inward_date, feed_type=payload.feed_type, bags=payload.bags, shed=shed))
        stock_record = db.scalar(
            select(FeedStock).where(
                FeedStock.farmer_id == user.id,
                FeedStock.shed == shed,
                FeedStock.feed_type == payload.feed_type,
            )
        )
        if stock_record:
            stock_record.bags = int(stock_record.bags or 0) + int(payload.bags)
        else:
            db.add(
                FeedStock(
                    farmer_id=user.id,
                    shed=shed,
                    feed_type=payload.feed_type,
                    bags=payload.bags,
                )
            )
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
        operational_costs = list(db.scalars(select(OperationalCost).where(OperationalCost.farmer_id == user.id).order_by(OperationalCost.entry_date.desc(), OperationalCost.created_at.desc())))
        sales = list(db.scalars(select(SaleRecord).where(SaleRecord.farmer_id == user.id).order_by(SaleRecord.entry_date.desc(), SaleRecord.created_at.desc())))
        issue_photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id == user.id).order_by(IssuePhoto.created_at.desc())))
    return {
        "profile": serialize_profile(user),
        "history": make_request_history(requests),
        "documents": make_document_history(documents),
        "operational_costs": make_operational_cost_history(operational_costs),
        "sales": make_sales_history(sales),
        "issue_photos": make_issue_photo_history(issue_photos),
    }


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


@app.post("/api/farmer/operational-costs")
async def add_operational_cost(
    request: Request,
    entry_date: str = Form(...),
    expense_category: str = Form(...),
    item_name: str = Form(...),
    shed: str = Form(""),
    vendor_name: str = Form(""),
    amount: str = Form(""),
    notes: str = Form(""),
    file: UploadFile | None = File(None),
):
    user = get_current_user(request, "farmer")
    stored_name = None
    original_name = None
    if file and file.filename:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original_name = file.filename or "expense-proof"
        suffix = Path(original_name).suffix or ".bin"
        stored_name = f"{timestamp}-{safe_slug(item_name)}{suffix}"
        destination = UPLOADS_DIR / stored_name
        destination.write_bytes(await file.read())
    with session_scope() as db:
        db.add(
            OperationalCost(
                farmer_id=user.id,
                entry_date=entry_date or today_string(),
                expense_category=expense_category,
                item_name=item_name,
                shed=shed,
                vendor_name=vendor_name,
                amount=amount,
                notes=notes,
                file_name=original_name,
                stored_name=stored_name,
                status="Submitted to owner finance",
            )
        )
        db.commit()
    return {"success": True}


@app.post("/api/farmer/sales")
async def add_sale_record(
    request: Request,
    entry_date: str = Form(...),
    bill_number: str = Form(...),
    party_name: str = Form(...),
    total_weight_kg: str = Form(...),
    rate_per_kg: str = Form(""),
    amount: str = Form(""),
    file: UploadFile | None = File(None),
):
    user = get_current_user(request, "farmer")
    stored_name = None
    original_name = None
    if file and file.filename:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original_name = file.filename or "sale-bill"
        suffix = Path(original_name).suffix or ".bin"
        stored_name = f"{timestamp}-{safe_slug(f'sale-{bill_number}-{party_name}')}{suffix}"
        destination = UPLOADS_DIR / stored_name
        destination.write_bytes(await file.read())
    with session_scope() as db:
        db.add(
            SaleRecord(
                farmer_id=user.id,
                entry_date=entry_date or today_string(),
                bill_number=bill_number.strip(),
                party_name=party_name.strip(),
                total_weight_kg=total_weight_kg.strip(),
                rate_per_kg=rate_per_kg.strip(),
                amount=compute_sale_amount_text(total_weight_kg, rate_per_kg, amount),
                file_name=original_name,
                stored_name=stored_name,
                status="Submitted to owner finance",
            )
        )
        db.commit()
    return {"success": True}


@app.post("/api/farmer/issues/photo")
async def upload_issue_photo(
    request: Request,
    issue_type: str = Form(...),
    shed: str = Form(""),
    priority: str = Form(...),
    notes: str = Form(""),
    file: UploadFile = File(...),
):
    user = get_current_user(request, "farmer")
    shed = (shed or "").strip() or user.current_shed or ""
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


@app.get("/api/owner/profile")
def owner_profile(request: Request):
    user = get_current_user(request, "owner")
    return serialize_profile(user)


@app.put("/api/owner/profile")
def owner_update_profile(payload: OwnerProfileUpdatePayload, request: Request):
    user = get_current_user(request, "owner")
    normalized_phone = normalize_phone(payload.phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Valid phone number required.")
    with session_scope() as db:
        owner = db.get(User, user.id)
        if not owner or owner.role != "owner":
            raise HTTPException(status_code=404, detail="Owner not found.")
        existing_user = db.scalar(select(User).where(User.phone == normalized_phone, User.id != owner.id))
        if existing_user:
            raise HTTPException(status_code=409, detail="Phone number already in use.")
        owner.name = payload.name.strip() or owner.name
        owner.phone = normalized_phone
        owner.cluster = payload.cluster.strip()
        if payload.password.strip():
            owner.password_hash = hash_password(payload.password.strip())
        db.add(owner)
        db.commit()
        db.refresh(owner)
        updated = serialize_profile(owner)
    response = JSONResponse({"success": True, "profile": updated})
    set_role_auth_cookie(response, owner)
    return response


@app.get("/api/owner/dashboard")
def owner_dashboard(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        farmer_ids = [farm.id for farm in farmers]
        daily_entries = list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id.in_(farmer_ids)).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc()))) if farmer_ids else []
        support_requests = list(db.scalars(select(SupportRequest).where(SupportRequest.farmer_id.in_(farmer_ids)).order_by(SupportRequest.created_at.desc()))) if farmer_ids else []
        issue_photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id.in_(farmer_ids)).order_by(IssuePhoto.created_at.desc()))) if farmer_ids else []
        documents = list(db.scalars(select(DocumentUpload).where(DocumentUpload.farmer_id.in_(farmer_ids)).order_by(DocumentUpload.created_at.desc()))) if farmer_ids else []
        field_visits = list(db.scalars(select(FieldVisit).where(FieldVisit.farmer_id.in_(farmer_ids)).order_by(FieldVisit.visit_date.desc(), FieldVisit.created_at.desc()))) if farmer_ids else []
        feed_stock = list(db.scalars(select(FeedStock).where(FeedStock.farmer_id.in_(farmer_ids)))) if farmer_ids else []
        medicine_stock = list(db.scalars(select(MedicineStock).where(MedicineStock.farmer_id.in_(farmer_ids)).order_by(MedicineStock.created_at.desc()))) if farmer_ids else []
        medicine_log = list(db.scalars(select(MedicineLog).where(MedicineLog.farmer_id.in_(farmer_ids)).order_by(MedicineLog.entry_date.desc(), MedicineLog.created_at.desc()))) if farmer_ids else []
        vaccine_log = list(db.scalars(select(VaccinationLog).where(VaccinationLog.farmer_id.in_(farmer_ids)).order_by(VaccinationLog.entry_date.desc(), VaccinationLog.created_at.desc()))) if farmer_ids else []

        latest_entries = latest_entries_by_shed(daily_entries)
        total_live_birds = sum(item.opening_birds - item.mortality - item.culls for item in latest_entries.values())
        high_mortality_farms = len([item for item in latest_entries.values() if item.mortality >= 15])
        pending_requests = len([item for item in support_requests if item.status != "Closed"])
        pending_docs = len(documents[:10])
        total_feed_bags = sum(item.bags for item in feed_stock)
        latest_reporting = summarize_owner_latest_entries(daily_entries, db)
        feed_visibility = summarize_owner_feed(feed_stock, db)
        health_watch = summarize_owner_health(medicine_stock, medicine_log, vaccine_log, db)
        priority_items = summarize_owner_requests(support_requests, db)[:5] + summarize_owner_issue_photos(issue_photos, db)[:5]
        field_activity = summarize_owner_field_visits(field_visits, db)[:6]
        uploads = summarize_owner_documents(documents, db)[:6]
        farm_performance = build_owner_farm_performance(farmers, daily_entries)

    return {
        "profile": serialize_profile(user),
        "kpis": [
            {"label": "Running farms", "value": str(len(farmers)), "note": "Mapped grower farms"},
            {"label": "Live birds", "value": f"{total_live_birds:,}", "note": "Latest submitted day across farms"},
            {"label": "Feed stock", "value": f"{total_feed_bags} bags", "note": "Current visible farm stock"},
            {"label": "Pending requests", "value": str(pending_requests), "note": "Farmer support queue"},
            {"label": "High mortality farms", "value": str(high_mortality_farms), "note": "Need immediate review"},
            {"label": "New documents", "value": str(pending_docs), "note": "Bills and uploads awaiting review"},
        ],
        "farms": [
            {
                "label": farm.farm_name or "-",
                "value": farm.active_batch or farm.farmer_code or "-",
                "note": join_present([farm.name, farm.cluster or "", farm.current_shed or ""]),
            }
            for farm in farmers[:6]
        ],
        "priority": priority_items,
        "field_activity": field_activity,
        "uploads": uploads,
        "latest_reporting": latest_reporting,
        "feed_visibility": feed_visibility,
        "health_watch": health_watch,
        "farm_performance": farm_performance,
    }


@app.get("/api/owner/farms")
def owner_farms(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        farmer_ids = [farm.id for farm in farmers]
        latest_entries = list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id.in_(farmer_ids)).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc()))) if farmer_ids else []
        feed_stock = list(db.scalars(select(FeedStock).where(FeedStock.farmer_id.in_(farmer_ids)))) if farmer_ids else []
        field_officers = [officer for officer in db.scalars(select(User).where(User.role == "field").order_by(User.name)) if valid_field_user(officer)]
        field_officer_map = {officer.name: officer for officer in field_officers}
        latest_by_farmer: dict[int, DailyEntry] = {}
        for entry in latest_entries:
            if entry.farmer_id not in latest_by_farmer:
                latest_by_farmer[entry.farmer_id] = entry
        feed_stock_totals: dict[int, int] = {}
        for item in feed_stock:
            feed_stock_totals[item.farmer_id] = feed_stock_totals.get(item.farmer_id, 0) + int(item.bags or 0)
        latest_entry_list = summarize_owner_latest_entries(latest_entries, db)

    return {
        "profile": serialize_profile(user),
        "farms": [
            {
                "label": farm.farm_name or "-",
                "value": farm.farmer_code or "-",
                "note": join_present(
                    [
                        farm.name,
                        f"Batch {farm.active_batch}" if farm.active_batch else "",
                        latest_by_farmer[farm.id].entry_date if farm.id in latest_by_farmer else "",
                    ]
                ),
                "farmer_code": farm.farmer_code or "",
                "farmer_name": farm.name,
                "phone": format_phone_display(farm.phone),
                "farm_name": farm.farm_name or "",
                "cluster": farm.cluster or "",
                "field_officer": farm.field_officer or "",
                "field_officer_phone": format_phone_display(field_officer_map[farm.field_officer].phone) if farm.field_officer in field_officer_map else "",
                "farm_capacity": farm.farm_capacity or "",
                "active_sheds": farm.active_sheds or 1,
                "active_batch": farm.active_batch or "",
                "current_shed": farm.current_shed or "",
                "bird_age_days": farm.bird_age_days or 0,
                "initial_batch_strength": farm.initial_batch_strength or 0,
                "feed_stock_bags": feed_stock_totals.get(farm.id, 0),
            }
            for farm in farmers
        ],
        "latest_entries": latest_entry_list,
        "farmer_accounts": [
            {
                "id": farm.id,
                "label": farm.farm_name or "-",
                "value": farm.farmer_code or "-",
                "note": join_present([farm.name, format_phone_display(farm.phone), farm.field_officer or ""]),
                "farmer_code": farm.farmer_code or "",
                "farmer_name": farm.name,
                "phone": format_phone_display(farm.phone),
                "farm_name": farm.farm_name or "",
                "cluster": farm.cluster or "",
                "field_officer": farm.field_officer or "",
                "field_officer_phone": format_phone_display(field_officer_map[farm.field_officer].phone) if farm.field_officer in field_officer_map else "",
                "farm_capacity": farm.farm_capacity or "",
                "active_sheds": farm.active_sheds or 1,
                "active_batch": farm.active_batch or "",
                "current_shed": farm.current_shed or "",
                "bird_age_days": farm.bird_age_days or 0,
                "initial_batch_strength": farm.initial_batch_strength or 0,
            }
            for farm in farmers
        ],
        "field_officers": [
            {
                "label": officer.name,
                "value": format_phone_display(officer.phone),
                "note": officer.cluster or "",
            }
            for officer in field_officers
        ],
    }


@app.post("/api/owner/farmers")
def owner_create_farmer(payload: OwnerFarmerEnrollmentPayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        normalized_phone = normalize_phone(payload.phone)
        normalized_officer_phone = normalize_phone(payload.field_officer_phone) if payload.field_officer_phone else ""
        generated_farmer_code = build_unique_farmer_code(db, payload.farm_name, payload.cluster)
        existing_phone = db.scalar(select(User).where(User.phone == normalized_phone))
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone number already exists.")

        officer = ensure_field_officer_by_values(
            db,
            officer_name=payload.field_officer,
            cluster=payload.cluster,
            officer_phone=normalized_officer_phone,
        )
        farmer = User(
            role="farmer",
            name=payload.farmer_name,
            phone=normalized_phone,
            password_hash=hash_password(payload.password),
            cluster=payload.cluster,
            farm_name=payload.farm_name,
            farmer_code=generated_farmer_code,
            active_batch="",
            bird_age_days=0,
            field_officer=officer.name if officer else "",
            farm_capacity=payload.farm_capacity,
            active_sheds=payload.active_sheds,
        )
        db.add(farmer)
        db.commit()
        db.refresh(farmer)

    return {
        "success": True,
        "message": "Farmer account created successfully.",
        "farmer": {
            "farmer_name": farmer.name,
            "farm_name": farmer.farm_name,
            "farmer_code": farmer.farmer_code,
            "phone": format_phone_display(farmer.phone),
            "field_officer": farmer.field_officer,
            "cluster": farmer.cluster,
        },
        "login_password": payload.password,
    }


@app.put("/api/owner/farmers/{farmer_code}")
def owner_update_farmer_account(farmer_code: str, payload: OwnerFarmerUpdatePayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == farmer_code))
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found.")

        normalized_phone = normalize_phone(payload.phone)
        normalized_officer_phone = normalize_phone(payload.field_officer_phone) if payload.field_officer_phone else ""
        generated_farmer_code = build_unique_farmer_code(db, payload.farm_name, payload.cluster, exclude_user_id=farmer.id)

        existing_phone = db.scalar(select(User).where(User.phone == normalized_phone, User.id != farmer.id))
        if existing_phone:
            raise HTTPException(status_code=400, detail="Phone number already exists.")

        officer = ensure_field_officer_by_values(
            db,
            officer_name=payload.field_officer,
            cluster=payload.cluster,
            officer_phone=normalized_officer_phone,
        )

        farmer.name = payload.farmer_name
        farmer.phone = normalized_phone
        if payload.password.strip():
            farmer.password_hash = hash_password(payload.password)
        farmer.cluster = payload.cluster
        farmer.farm_name = payload.farm_name
        farmer.farmer_code = generated_farmer_code
        farmer.field_officer = officer.name if officer else ""
        farmer.farm_capacity = payload.farm_capacity
        farmer.active_sheds = payload.active_sheds
        db.add(farmer)
        db.commit()
        db.refresh(farmer)

    return {
        "success": True,
        "message": "Farmer account updated successfully.",
        "farmer": {
            "farmer_name": farmer.name,
            "farm_name": farmer.farm_name,
            "farmer_code": farmer.farmer_code,
            "phone": format_phone_display(farmer.phone),
            "field_officer": farmer.field_officer,
            "cluster": farmer.cluster,
            "farm_capacity": farmer.farm_capacity or "",
            "active_sheds": farmer.active_sheds or 1,
        },
    }


@app.post("/api/owner/farmers/batch")
def owner_update_farmer_batch(payload: OwnerBatchEntryPayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == payload.farmer_code))
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found.")

        farmer.active_batch = payload.active_batch.strip()
        farmer.current_shed = payload.current_shed.strip()
        farmer.bird_age_days = payload.bird_age_days
        farmer.initial_batch_strength = payload.initial_batch_strength
        db.add(farmer)
        db.commit()
        db.refresh(farmer)

    return {
        "success": True,
        "message": "Batch updated successfully.",
        "farmer": {
            "farmer_name": farmer.name,
            "farm_name": farmer.farm_name,
            "farmer_code": farmer.farmer_code,
            "active_batch": farmer.active_batch or "",
            "current_shed": farmer.current_shed or "",
            "bird_age_days": farmer.bird_age_days or 0,
            "initial_batch_strength": farmer.initial_batch_strength or 0,
        },
    }


@app.post("/api/owner/operational-costs")
async def owner_add_operational_cost(
    request: Request,
    farmer_code: str = Form(...),
    entry_date: str = Form(...),
    expense_category: str = Form(...),
    item_name: str = Form(...),
    shed: str = Form(""),
    vendor_name: str = Form(""),
    amount: str = Form(""),
    notes: str = Form(""),
    file: UploadFile | None = File(None),
):
    get_current_user(request, "owner")
    stored_name = None
    original_name = None
    if file and file.filename:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original_name = file.filename or "owner-expense-proof"
        suffix = Path(original_name).suffix or ".bin"
        stored_name = f"{timestamp}-{safe_slug(item_name)}{suffix}"
        destination = UPLOADS_DIR / stored_name
        destination.write_bytes(await file.read())
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == farmer_code))
        if not valid_farmer_user(farmer):
            raise HTTPException(status_code=404, detail="Farmer not found.")

        db.add(
            OperationalCost(
                farmer_id=farmer.id,
                entry_date=entry_date or today_string(),
                expense_category=expense_category,
                item_name=item_name,
                shed=shed.strip(),
                vendor_name=vendor_name.strip(),
                amount=amount.strip(),
                notes=notes.strip(),
                file_name=original_name,
                stored_name=stored_name,
                status="Submitted by owner finance",
            )
        )
        db.commit()

    return {"success": True, "message": "Operational cost saved successfully."}


@app.post("/api/owner/sales")
async def owner_add_sale_record(
    request: Request,
    farmer_code: str = Form(...),
    entry_date: str = Form(...),
    bill_number: str = Form(...),
    party_name: str = Form(...),
    total_weight_kg: str = Form(...),
    rate_per_kg: str = Form(""),
    amount: str = Form(""),
    file: UploadFile | None = File(None),
):
    get_current_user(request, "owner")
    stored_name = None
    original_name = None
    if file and file.filename:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        original_name = file.filename or "owner-sale-bill"
        suffix = Path(original_name).suffix or ".bin"
        stored_name = f"{timestamp}-{safe_slug(f'sale-{bill_number}-{party_name}')}{suffix}"
        destination = UPLOADS_DIR / stored_name
        destination.write_bytes(await file.read())
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == farmer_code))
        if not valid_farmer_user(farmer):
            raise HTTPException(status_code=404, detail="Farmer not found.")

        db.add(
            SaleRecord(
                farmer_id=farmer.id,
                entry_date=entry_date or today_string(),
                bill_number=bill_number.strip(),
                party_name=party_name.strip(),
                total_weight_kg=total_weight_kg.strip(),
                rate_per_kg=rate_per_kg.strip(),
                amount=compute_sale_amount_text(total_weight_kg, rate_per_kg, amount),
                file_name=original_name,
                stored_name=stored_name,
                status="Submitted by owner finance",
            )
        )
        db.commit()

    return {"success": True, "message": "Sale saved successfully."}


@app.put("/api/owner/sales/{sale_id}")
def owner_update_sale_rate(sale_id: int, payload: OwnerSaleRateUpdatePayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        sale = db.get(SaleRecord, sale_id)
        if not sale:
            raise HTTPException(status_code=404, detail="Sale record not found.")
        rate_value = (payload.rate_per_kg or "").strip()
        if not rate_value:
            raise HTTPException(status_code=400, detail="Rate is required.")
        sale.rate_per_kg = rate_value
        sale.amount = compute_sale_amount_text(sale.total_weight_kg, rate_value, "")
        db.add(sale)
        db.commit()
        db.refresh(sale)

    return {
        "success": True,
        "sale": {
            "sale_id": sale.id,
            "rate_per_kg": sale.rate_per_kg,
            "amount": sale.amount,
            "total_weight_kg": sale.total_weight_kg,
        },
    }


@app.get("/api/owner/operations")
def owner_operations(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        farmer_ids = [farm.id for farm in farmers]
        requests = list(db.scalars(select(SupportRequest).where(SupportRequest.farmer_id.in_(farmer_ids)).order_by(SupportRequest.created_at.desc()))) if farmer_ids else []
        photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id.in_(farmer_ids)).order_by(IssuePhoto.created_at.desc()))) if farmer_ids else []
        visits = list(db.scalars(select(FieldVisit).where(FieldVisit.farmer_id.in_(farmer_ids)).order_by(FieldVisit.visit_date.desc(), FieldVisit.created_at.desc()))) if farmer_ids else []
        daily_entries = list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id.in_(farmer_ids)).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc()))) if farmer_ids else []
        feed_stock = list(db.scalars(select(FeedStock).where(FeedStock.farmer_id.in_(farmer_ids)))) if farmer_ids else []
        daily_entry_list = summarize_owner_latest_entries(daily_entries, db)
        daily_entry_hierarchy = build_owner_daily_entry_hierarchy(farmers, daily_entries, feed_stock)
        request_items = summarize_owner_requests(requests, db)
        photo_items = summarize_owner_issue_photos(photos, db)
        visit_items = summarize_owner_field_visits(visits, db)
    return {
        "profile": serialize_profile(user),
        "requests": request_items,
        "photos": photo_items,
        "visits": visit_items,
        "daily_entries": daily_entry_list,
        "daily_entry_hierarchy": daily_entry_hierarchy,
    }


@app.get("/api/owner/finance")
def owner_finance(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        parties = list(db.scalars(select(PartyContact).where(PartyContact.is_active == True).order_by(PartyContact.name)))
        farmer_ids = [farm.id for farm in farmers]
        farmer_map = {farm.id: farm for farm in farmers}
        documents = list(db.scalars(select(DocumentUpload).where(DocumentUpload.farmer_id.in_(farmer_ids)).order_by(DocumentUpload.created_at.desc()))) if farmer_ids else []
        operational_costs = list(db.scalars(select(OperationalCost).where(OperationalCost.farmer_id.in_(farmer_ids)).order_by(OperationalCost.entry_date.desc(), OperationalCost.created_at.desc()))) if farmer_ids else []
        sales = list(db.scalars(select(SaleRecord).where(SaleRecord.farmer_id.in_(farmer_ids)).order_by(SaleRecord.entry_date.desc(), SaleRecord.created_at.desc()))) if farmer_ids else []
        feed_inward = list(db.scalars(select(FeedInward).where(FeedInward.farmer_id.in_(farmer_ids)).order_by(FeedInward.inward_date.desc(), FeedInward.created_at.desc()))) if farmer_ids else []
        document_items = summarize_owner_documents(documents, db)
        operational_cost_items = summarize_owner_operational_costs(operational_costs, db)
        sales_items = summarize_owner_sales(sales, db)
        operational_cost_breakdown = summarize_operational_cost_breakdown(operational_costs)
        inward_items = [
            {
                "label": f"{farmer_map[item.farmer_id].farm_name if item.farmer_id in farmer_map else '-'} / {item.shed}",
                "value": f"{item.bags} bags",
                "note": f"{item.inward_date} • {item.feed_type}",
            }
            for item in feed_inward[:10]
        ]
    total_doc_amount = sum(parse_amount_value(doc.amount) for doc in documents)
    total_operational_cost = sum(parse_amount_value(item.amount) for item in operational_costs)
    total_sale_amount = sum(compute_sale_amount_value(item.total_weight_kg, item.rate_per_kg, item.amount) for item in sales)
    total_sale_weight_kg = sum(parse_amount_value(item.total_weight_kg) for item in sales)
    return {
        "profile": serialize_profile(user),
        "kpis": [
            {"label": "Uploaded bills", "value": str(len(documents)), "note": "Documents received from farms"},
            {"label": "Reported bills amount", "value": f"Rs {total_doc_amount:,.0f}", "note": "Parsed from bill uploads"},
            {"label": "Sale entries", "value": str(len(sales)), "note": "Farm sale records received"},
            {"label": "Sale weight", "value": f"{total_sale_weight_kg:,.0f} kg", "note": "Total reported sale weight"},
            {"label": "Sale amount", "value": f"Rs {total_sale_amount:,.0f}", "note": "Parsed from sale records"},
            {"label": "Operational cost entries", "value": str(len(operational_costs)), "note": "Farm expense records received"},
            {"label": "Operational cost total", "value": f"Rs {total_operational_cost:,.0f}", "note": "Parsed from farm expense entries"},
            {"label": "Feed inward entries", "value": str(len(feed_inward)), "note": "Recent inward records"},
        ],
        "category_breakdown": operational_cost_breakdown,
        "documents": document_items,
        "sales": sales_items,
        "operational_costs": operational_cost_items,
        "feed_inward": inward_items,
        "farmer_options": [
            {
                "farmer_code": farm.farmer_code or "",
                "farm_name": farm.farm_name or "",
                "farmer_name": farm.name or "",
                "active_batch": farm.active_batch or "",
                "current_shed": farm.current_shed or "",
                "active_sheds": farm.active_sheds or 1,
                "bird_age_days": farm.bird_age_days or 0,
                "initial_batch_strength": farm.initial_batch_strength or 0,
            }
            for farm in farmers
        ],
        "party_options": [
            {
                "name": party.name,
                "phone": format_phone_display(party.phone),
                "market_area": party.market_area or "",
            }
            for party in parties
        ],
    }


@app.get("/api/owner/reports")
def owner_reports(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        farmer_ids = [farm.id for farm in farmers]
        daily_entries = list(db.scalars(select(DailyEntry).where(DailyEntry.farmer_id.in_(farmer_ids)).order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc()))) if farmer_ids else []
        operational_costs = list(db.scalars(select(OperationalCost).where(OperationalCost.farmer_id.in_(farmer_ids)).order_by(OperationalCost.entry_date.desc(), OperationalCost.created_at.desc()))) if farmer_ids else []
        sales = list(db.scalars(select(SaleRecord).where(SaleRecord.farmer_id.in_(farmer_ids)).order_by(SaleRecord.entry_date.desc(), SaleRecord.created_at.desc()))) if farmer_ids else []
        documents = list(db.scalars(select(DocumentUpload).where(DocumentUpload.farmer_id.in_(farmer_ids)).order_by(DocumentUpload.created_at.desc()))) if farmer_ids else []
        feed_inward = list(db.scalars(select(FeedInward).where(FeedInward.farmer_id.in_(farmer_ids)).order_by(FeedInward.inward_date.desc(), FeedInward.created_at.desc()))) if farmer_ids else []
        reports = build_owner_farm_reports(farmers, daily_entries, operational_costs, sales, documents, feed_inward)

    total_operational_cost = sum(parse_amount_value(item.amount) for item in operational_costs)
    total_sales_amount = sum(compute_sale_amount_value(item.total_weight_kg, item.rate_per_kg, item.amount) for item in sales)
    total_sale_weight_kg = sum(parse_amount_value(item.total_weight_kg) for item in sales)
    return {
        "profile": serialize_profile(user),
        "summary_kpis": [
            {"label": "Farms", "value": str(len(farmers)), "note": "Farms available for report"},
            {"label": "Operational cost", "value": f"Rs {total_operational_cost:,.0f}", "note": "Combined cost across farms"},
            {"label": "Sales amount", "value": f"Rs {total_sales_amount:,.0f}", "note": "Combined sale amount across farms"},
            {"label": "Sale weight", "value": f"{total_sale_weight_kg:,.0f} kg", "note": "Combined sold weight across farms"},
        ],
        "reports": reports,
    }


@app.get("/api/owner/files")
def owner_files(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        farmer_ids = [farm.id for farm in farmers]
        documents = list(db.scalars(select(DocumentUpload).where(DocumentUpload.farmer_id.in_(farmer_ids)).order_by(DocumentUpload.created_at.desc()))) if farmer_ids else []
        issue_photos = list(db.scalars(select(IssuePhoto).where(IssuePhoto.farmer_id.in_(farmer_ids)).order_by(IssuePhoto.created_at.desc()))) if farmer_ids else []
        daily_entries = list(
            db.scalars(
                select(DailyEntry)
                .where(
                    DailyEntry.farmer_id.in_(farmer_ids),
                    DailyEntry.litter_photo_stored.is_not(None),
                )
                .order_by(DailyEntry.created_at.desc())
            )
        ) if farmer_ids else []
        library = build_owner_file_library(farmers, documents, issue_photos, daily_entries)

    return {
        "profile": serialize_profile(user),
        "kpis": [
            {"label": "Farms", "value": str(len(farmers)), "note": "Farms with upload visibility"},
            {"label": "Documents", "value": str(sum(item["documents_count"] for item in library)), "note": "Bills and documents uploaded"},
            {"label": "Images", "value": str(sum(item["photos_count"] for item in library)), "note": "Issue and litter photos available"},
        ],
        "farms": library,
    }


@app.get("/api/owner/parties")
def owner_parties(request: Request):
    user = get_current_user(request, "owner")
    with session_scope() as db:
        farmers = [farm for farm in db.scalars(select(User).where(User.role == "farmer").order_by(User.farm_name)) if valid_farmer_user(farm)]
        farmer_ids = [farm.id for farm in farmers]
        parties = list(db.scalars(select(PartyContact).order_by(PartyContact.name)))
        rules = get_sale_rule_map(db, farmer_ids)
        entries = (
            list(
                db.scalars(
                    select(DailyEntry)
                    .where(DailyEntry.farmer_id.in_(farmer_ids))
                    .order_by(DailyEntry.entry_date.desc(), DailyEntry.created_at.desc())
                )
            )
            if farmer_ids
            else []
        )
        sale_ready_queue = build_sale_ready_queue(farmers, entries, parties, rules)

    return {
        "profile": serialize_profile(user),
        "parties": [
            {
                "id": party.id,
                "label": party.name,
                "value": format_phone_display(party.phone),
                "note": join_present(
                    [
                        party.market_area or "",
                        "Active" if party.is_active else "Inactive",
                        party.preferred_clusters or "",
                    ]
                ),
                "name": party.name,
                "phone": format_phone_display(party.phone),
                "market_area": party.market_area or "",
                "preferred_clusters": party.preferred_clusters or "",
                "preferred_farms": party.preferred_farms or "",
                "notes": party.notes or "",
                "is_active": party.is_active,
            }
            for party in parties
        ],
        "sale_rules": [
            {
                "label": farm.farm_name or "-",
                "value": f"{(rules.get(farm.id).ready_weight_g if rules.get(farm.id) else 0)} g",
                "note": join_present(
                    [
                        farm.farmer_code or "",
                        f"Batch {farm.active_batch}" if farm.active_batch else "",
                        "Auto WhatsApp" if rules.get(farm.id) and rules.get(farm.id).auto_whatsapp_enabled else "Manual alert",
                    ]
                ),
                "farmer_code": farm.farmer_code or "",
                "farm_name": farm.farm_name or "",
                "farmer_name": farm.name or "",
                "ready_weight_g": rules.get(farm.id).ready_weight_g if rules.get(farm.id) else 0,
                "auto_whatsapp_enabled": bool(rules.get(farm.id).auto_whatsapp_enabled) if rules.get(farm.id) else False,
                "notes": rules.get(farm.id).notes if rules.get(farm.id) else "",
            }
            for farm in farmers
        ],
        "sale_ready_queue": sale_ready_queue,
        "farmer_options": [
            {
                "farmer_code": farm.farmer_code or "",
                "farm_name": farm.farm_name or "",
                "farmer_name": farm.name or "",
                "active_batch": farm.active_batch or "",
                "current_shed": farm.current_shed or "",
                "bird_age_days": farm.bird_age_days or 0,
                "initial_batch_strength": farm.initial_batch_strength or 0,
            }
            for farm in farmers
        ],
        "meta": {
            "whatsapp_mode": "ready" if whatsapp_ready() else "pending_business_setup",
            "whatsapp_note": (
                "Auto WhatsApp is live for sale-ready farms."
                if whatsapp_ready()
                else "Automatic WhatsApp alerts will go live after WhatsApp Business Platform credentials "
                "and an approved message template are connected."
            ),
        },
    }


@app.post("/api/owner/parties")
def owner_create_party(payload: OwnerPartyPayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        normalized_phone = normalize_phone(payload.phone)
        if not normalized_phone:
            raise HTTPException(status_code=400, detail="Phone number required.")
        existing_party = db.scalar(select(PartyContact).where(PartyContact.phone == normalized_phone))
        if existing_party:
            raise HTTPException(status_code=400, detail="Party phone already exists.")
        party = PartyContact(
            name=payload.name.strip(),
            phone=normalized_phone,
            market_area=payload.market_area.strip(),
            preferred_clusters=payload.preferred_clusters.strip(),
            preferred_farms=payload.preferred_farms.strip(),
            notes=payload.notes.strip(),
            is_active=payload.is_active,
        )
        db.add(party)
        db.commit()
        db.refresh(party)
    return {
        "success": True,
        "party": {
            "id": party.id,
            "name": party.name,
            "phone": format_phone_display(party.phone),
        },
    }


@app.put("/api/owner/parties/{party_id}")
def owner_update_party(party_id: int, payload: OwnerPartyPayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        party = db.get(PartyContact, party_id)
        if not party:
            raise HTTPException(status_code=404, detail="Party not found.")
        normalized_phone = normalize_phone(payload.phone)
        if not normalized_phone:
            raise HTTPException(status_code=400, detail="Phone number required.")
        existing_party = db.scalar(select(PartyContact).where(PartyContact.phone == normalized_phone, PartyContact.id != party_id))
        if existing_party:
            raise HTTPException(status_code=400, detail="Party phone already exists.")
        party.name = payload.name.strip()
        party.phone = normalized_phone
        party.market_area = payload.market_area.strip()
        party.preferred_clusters = payload.preferred_clusters.strip()
        party.preferred_farms = payload.preferred_farms.strip()
        party.notes = payload.notes.strip()
        party.is_active = payload.is_active
        db.add(party)
        db.commit()
        db.refresh(party)
    return {
        "success": True,
        "party": {
            "id": party.id,
            "name": party.name,
            "phone": format_phone_display(party.phone),
        },
    }


@app.post("/api/owner/parties/rules")
def owner_save_sale_rule(payload: OwnerSaleReadyRulePayload, request: Request):
    get_current_user(request, "owner")
    with session_scope() as db:
        farmer = db.scalar(select(User).where(User.role == "farmer", User.farmer_code == payload.farmer_code))
        if not farmer:
            raise HTTPException(status_code=404, detail="Farmer not found.")
        rule = db.scalar(select(SaleReadyRule).where(SaleReadyRule.farmer_id == farmer.id))
        if not rule:
            rule = SaleReadyRule(farmer_id=farmer.id)
        rule.ready_weight_g = payload.ready_weight_g
        rule.auto_whatsapp_enabled = payload.auto_whatsapp_enabled
        rule.notes = payload.notes.strip()
        db.add(rule)
        db.commit()
        db.refresh(rule)
    return {
        "success": True,
        "rule": {
            "farmer_code": farmer.farmer_code or "",
            "farm_name": farmer.farm_name or "",
            "ready_weight_g": rule.ready_weight_g,
            "auto_whatsapp_enabled": rule.auto_whatsapp_enabled,
            "notes": rule.notes or "",
        },
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


@app.get("/owner-app")
@app.get("/owner-app/")
def owner_login_page():
    return app_file_response("owner-app", "index.html")


@app.get("/owner-app/{file_name:path}")
def owner_app_files(file_name: str, request: Request):
    clean_name = file_name or "index.html"
    if clean_name in OWNER_APP_PUBLIC:
        return app_file_response("owner-app", clean_name)
    try:
        get_current_user(request, "owner")
    except HTTPException:
        return RedirectResponse(url="/owner-app/", status_code=302)
    return app_file_response("owner-app", clean_name)


app.mount("/assets", StaticFiles(directory=PROJECT_ROOT / "assets"), name="assets")
