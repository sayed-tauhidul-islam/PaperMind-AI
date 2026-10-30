from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("papers", "0004_paper_tags_annotations"),
    ]

    operations = [
        migrations.CreateModel(
            name="ResearchWorkspace",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("topic", models.CharField(blank=True, max_length=500)),
                ("research_question", models.TextField(blank=True, max_length=5000)),
                ("objectives", models.JSONField(blank=True, default=list)),
                ("selected_paper_ids", models.JSONField(blank=True, default=list)),
                ("drafts", models.JSONField(blank=True, default=list)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="research_workspace", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
