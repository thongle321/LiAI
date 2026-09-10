from pydantic import BaseModel


class RealtimeTokenResponse(BaseModel):
    token: str
    call_id: str
    user_id: str
    api_key: str
