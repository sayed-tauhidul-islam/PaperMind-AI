from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL), ("papers", "0003_paper_owner")]
    operations = [migrations.CreateModel(name="ChatMessage", fields=[("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("question", models.TextField()), ("answer", models.TextField()), ("evidence", models.JSONField(blank=True, default=list)), ("created_at", models.DateTimeField(auto_now_add=True)), ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chat_messages", to=settings.AUTH_USER_MODEL)), ("paper", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chat_messages", to="papers.paper"))])]
