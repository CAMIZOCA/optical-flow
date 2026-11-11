from django.http import JsonResponse
from django.urls import path

from captures import views

urlpatterns = [
    path("health/", lambda request: JsonResponse({"ok": True})),
    path("api/captures/", views.captures),
    path("api/captures/<uuid:capture_id>/ocr/", views.extract),
    path("api/captures/<uuid:capture_id>/approve/", views.approve),
    path("api/captures/<uuid:capture_id>/image/", views.image),
]
