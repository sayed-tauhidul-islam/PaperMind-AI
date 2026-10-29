from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("chat", "0002_chatconversation_chatmessage_conversation")]
    operations = [migrations.AddField(model_name="chatconversation", name="is_locked", field=models.BooleanField(default=False))]
