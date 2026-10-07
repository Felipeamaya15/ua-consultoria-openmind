from pymongo import MongoClient
from django.conf import settings

_client = None


def get_mongo_client():
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client


def get_mongo_db():
    return get_mongo_client()[settings.MONGO_DB_NAME]
