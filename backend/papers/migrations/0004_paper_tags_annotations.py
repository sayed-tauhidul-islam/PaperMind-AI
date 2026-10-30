from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("papers", "0003_paper_owner"),
    ]

    operations = [
        migrations.AddField(
            model_name="paper",
            name="tags",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.CreateModel(
            name="PaperNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("content", models.TextField(max_length=10000)),
                ("page", models.PositiveIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="paper_notes", to=settings.AUTH_USER_MODEL)),
                ("paper", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notes", to="papers.paper")),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="PaperHighlight",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quote", models.TextField(max_length=5000)),
                ("page", models.PositiveIntegerField(blank=True, null=True)),
                ("color", models.CharField(default="yellow", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="paper_highlights", to=settings.AUTH_USER_MODEL)),
                ("paper", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="highlights", to="papers.paper")),
            ],
            options={"ordering": ["page", "created_at"]},
        ),
    ]
