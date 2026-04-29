from django.apps import AppConfig


class AiAssistantConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.ai_assistant'
    verbose_name = 'AI Assistant'

    def ready(self):
        # Importing the tools package registers all tool handlers.
        from . import tools  # noqa: F401
