INSERT INTO "achievement_definitions"
  ("code", "name", "description", "emoji", "category", "trigger_type", "trigger_value", "is_automatic", "is_active")
VALUES
  ('STREAK_3', 'Старт дан', 'Непрерывная серия 3 дня', '🟢', 'streak', 'streak', 3, true, true),
  ('STREAK_7', 'Стабильность', 'Непрерывная серия 7 дней', '🔵', 'streak', 'streak', 7, true, true),
  ('STREAK_14', 'Дисциплина', 'Непрерывная серия 14 дней', '🟣', 'streak', 'streak', 14, true, true),
  ('STREAK_21', 'Не остановить', 'Непрерывная серия 21 день', '🔴', 'streak', 'streak', 21, true, true),
  ('STREAK_31', '31 день в игре', 'Все 31 день без пропусков', '🟡', 'streak', 'streak', 31, true, true),
  ('FIRST_SUP', 'Первый SUP', 'Первая подтверждённая активность типа SUP', '🌊', 'activity', 'activity_type', NULL, true, true),
  ('RUNNER', 'Бегун', 'Первая подтверждённая активность типа Бег', '🏃', 'activity', 'activity_type', NULL, true, true),
  ('WORKOUT', 'Турникмен', 'Активность Турник / воркаут', '💪', 'activity', 'activity_type', NULL, true, true),
  ('EARLY_START', 'Ранний старт', 'Активность зарегистрирована до 08:00 по часовому поясу конкурса', '🌅', 'time', 'activity_time', 8, true, true),
  ('FAMILY', 'Семья в игре', 'Активность Семейная тренировка', '👨‍👩‍👧', 'activity', 'activity_type', NULL, true, true),
  ('WITH_FRIEND', 'Вместе веселее', 'Активность Тренировка с другом', '🤝', 'activity', 'activity_type', NULL, true, true),
  ('BAD_WEATHER', 'Погода не помеха', 'Активность в сложных погодных условиях', '🌧', 'manual', 'manual', NULL, false, true),
  ('RECOVERY', 'Время восстановиться', 'Хотя бы одна активность Йога или Растяжка', '🧘', 'activity', 'activity_type', NULL, true, true),
  ('TRY_NEW', 'Попробовал новое', 'У пользователя есть минимум 2 разных вида активности', '🚴', 'activity', 'distinct_activity_type', 2, true, true),
  ('WEEKEND', 'Выходные в игре', 'Активность и в субботу, и в следующее за ней воскресенье', '🔥', 'combination', 'weekend_pair', NULL, true, true),
  ('RETURN', 'Возвращение', 'После пропуска сформирована новая серия не менее 7 дней', '🔄', 'combination', 'return_streak', 7, true, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "emoji" = EXCLUDED."emoji",
  "category" = EXCLUDED."category",
  "trigger_type" = EXCLUDED."trigger_type",
  "trigger_value" = EXCLUDED."trigger_value",
  "is_automatic" = EXCLUDED."is_automatic",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now();
