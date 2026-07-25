from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    trips_owned = relationship("TripRecord", back_populates="owner")
    trip_memberships = relationship("TripMember", back_populates="user")

class TripRecord(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    origin = Column(String, index=True)
    destination = Column(String, index=True)
    departure_date = Column(String)
    arrival_date = Column(String)
    adults = Column(Integer)
    budget = Column(Float)
    is_archived = Column(Boolean, default=False)
    
    # Store the entire complex nested structure as JSON
    trip_data = Column(JSON)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    owner = relationship("User", back_populates="trips_owned")
    members = relationship("TripMember", back_populates="trip")

class TripMember(Base):
    __tablename__ = "trip_members"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String, default="viewer") # "editor", "viewer", "admin"
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    trip = relationship("TripRecord", back_populates="members")
    user = relationship("User", back_populates="trip_memberships")

# --- Vacay Models ---

class VacayPlan(Base):
    __tablename__ = "vacay_plans"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    block_weekends = Column(Boolean, default=True)
    holidays_enabled = Column(Boolean, default=True)
    holidays_region = Column(String, default="US")
    carry_over_enabled = Column(Boolean, default=False)
    week_start = Column(Integer, default=1) # 1=Mon, 0=Sun

class VacayPlanMember(Base):
    __tablename__ = "vacay_plan_members"
    plan_id = Column(Integer, ForeignKey("vacay_plans.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    status = Column(String, default="active")

class VacayUserColor(Base):
    __tablename__ = "vacay_user_colors"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    plan_id = Column(Integer, ForeignKey("vacay_plans.id"), primary_key=True)
    color = Column(String)

class VacayUserYear(Base):
    __tablename__ = "vacay_user_years"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    plan_id = Column(Integer, ForeignKey("vacay_plans.id"), primary_key=True)
    year = Column(Integer, primary_key=True)
    vacation_days = Column(Integer, default=20)
    carried_over = Column(Integer, default=0)

class VacayEntry(Base):
    __tablename__ = "vacay_entries"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("vacay_plans.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(String, index=True) # YYYY-MM-DD
    note = Column(String, nullable=True)

class VacayHolidayCalendar(Base):
    __tablename__ = "vacay_holiday_calendars"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("vacay_plans.id"))
    region = Column(String)
    label = Column(String)
    color = Column(String)
    sort_order = Column(Integer)

class TripFile(Base):
    __tablename__ = "trip_files"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"))
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"))
    storage_key = Column(String, index=True)
    original_name = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    description = Column(String, nullable=True)
    starred = Column(Boolean, default=False)
    
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trip = relationship("TripRecord")
    uploader = relationship("User")
    links = relationship("FileLink", back_populates="file", cascade="all, delete-orphan")

class FileLink(Base):
    __tablename__ = "file_links"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("trip_files.id"))
    place_id = Column(String, nullable=True)
    reservation_id = Column(String, nullable=True)

    file = relationship("TripFile", back_populates="links")

# --- Vacay Chatbot Models ---

class ChatConversation(Base):
    """Persistent conversation thread for the Vacay Chatbot."""
    __tablename__ = "chat_conversations"

    # UUID string so the client can hold a stable conversation_id.
    id = Column(String, primary_key=True, index=True)
    # NOTE: users.id and trips.id are Integer, so these FKs must be Integer too.
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True)

    # Travel Context JSON (destination, dates, travellers, budget, preferences...)
    travel_context = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    messages = relationship(
        "ChatMessageRecord",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


class ChatMessageRecord(Base):
    """A single chat message — conversation memory."""
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, index=True)
    conversation_id = Column(String, ForeignKey("chat_conversations.id"), index=True)
    role = Column(String)  # "user" | "assistant"
    content = Column(Text)
    intent = Column(String, nullable=True)
    sources = Column(JSON, nullable=True)

    # Both messages of a turn are committed together and would otherwise share
    # an identical created_at, leaving the random UUID id as the tiebreaker and
    # scrambling the transcript. `seq` orders messages within a turn.
    seq = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("ChatConversation", back_populates="messages")


class UserPreference(Base):
    """Long-term traveller preferences learned across conversations."""
    __tablename__ = "user_preferences"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True)

    travel_style = Column(String, nullable=True)   # backpacker | luxury | budget | ...
    food_preferences = Column(JSON, default=list)  # ["vegetarian", "halal", ...]
    activity_preferences = Column(JSON, default=list)  # ["history", "nature", ...]
    travel_pace = Column(String, nullable=True)    # relaxed | balanced | fast-paced

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
