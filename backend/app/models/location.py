from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    parent_location_id: Mapped[int | None] = mapped_column(ForeignKey("locations.id"))
    location_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # OSM boundary relation used to build the Overpass area filter.
    osm_relation_id: Mapped[int | None] = mapped_column(Integer)
    osm_admin_level: Mapped[int | None] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
