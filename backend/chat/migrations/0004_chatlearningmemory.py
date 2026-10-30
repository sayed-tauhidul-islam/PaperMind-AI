from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0003_chatconversation_is_locked"),
        ("papers", "0005_research_workspace"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="ChatLearningMemory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("question", models.TextField(max_length=4000)),
                ("answer", models.TextField(max_length=10000)),
                ("evidence", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chat_learning_memories", to=settings.AUTH_USER_MODEL)),
                ("paper", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_memories", to="papers.paper")),
                ("source_message", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="learning_memory", to="chat.chatmessage")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
