from dataclasses import dataclass
from typing import Optional, Dict, Any
from datetime import datetime


@dataclass
class UserEntity:
    id: Optional[int]
    username: str
    email: str
    first_name: str = ""
    last_name: str = ""
    is_active: bool = True
    is_staff: bool = False
    date_joined: Optional[datetime] = None

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.username


@dataclass
class ConfiguracionAutenticacionEntity:
    id: Optional[int]
    tienda_id: int
    email_password: bool = True
    google: bool = False
    google_client_id: str = ""
    guest_checkout: bool = True
    requires_auth: str = "optional"


@dataclass
class ConfiguracionPagosEntity:
    id: Optional[int]
    tienda_id: int
    metodos: Dict[str, Dict[str, Any]]
