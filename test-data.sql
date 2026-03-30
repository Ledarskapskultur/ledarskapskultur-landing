-- ============================================
-- TEST DATA: Lägg in denna i Supabase SQL Editor
-- ============================================

-- 1. CREATE TEST ORGANIZATION
INSERT INTO organizations (id, name, slug, description, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Ledarskapskultur',
  'ledarskapskultur',
  'En organisation för utbildning i ledarskap',
  true,
  now(),
  now()
) RETURNING id AS org_id;

-- SAVE ORG ID FROM ABOVE AND USE IT BELOW
-- For demo, we'll use a hardcoded ID but in production get it from RETURNING

-- Get the org ID (using a subquery approach)
WITH org_insert AS (
  SELECT id as org_id FROM organizations WHERE slug = 'ledarskapskultur' LIMIT 1
)
INSERT INTO user_profiles (id, user_id, organization_id, role, first_name, last_name, email, phone, is_active)
SELECT
  gen_random_uuid(),
  gen_random_uuid(),
  org.org_id,
  roles.role::user_role,
  roles.first_name,
  roles.last_name,
  roles.email,
  roles.phone,
  true
FROM (
  SELECT * FROM org_insert
) org,
LATERAL (
  VALUES
    ('admin', 'Anna', 'Admin', 'anna@ledarskapskultur.se', '+46701234567'),
    ('arranger', 'Bo', 'Arrangör', 'bo@ledarskapskultur.se', '+46702345678'),
    ('instructor', 'Cissi', 'Coach', 'cissi@ledarskapskultur.se', '+46703456789'),
    ('participant', 'David', 'Deltagare', 'david@example.com', '+46704567890')
) AS roles(role, first_name, last_name, email, phone);

-- 2. INSERT CONTACTS
WITH org_id AS (
  SELECT id FROM organizations WHERE slug = 'ledarskapskultur' LIMIT 1
),
admin_user AS (
  SELECT id FROM user_profiles WHERE email = 'anna@ledarskapskultur.se' LIMIT 1
)
INSERT INTO contacts (id, organization_id, name, email, phone, title, company_name, created_by)
SELECT
  gen_random_uuid(),
  org.id,
  contact_data.name,
  contact_data.email,
  contact_data.phone,
  contact_data.title,
  contact_data.company,
  admin.id
FROM org_id org, admin_user admin,
LATERAL (
  VALUES
    ('Erik Företag', 'erik@företag.se', '+46705678901', 'HR-chef', 'Företag AB'),
    ('Frida Fredrik', 'frida@företag.se', '+46706789012', 'Personalchef', 'Företag AB')
) AS contact_data(name, email, phone, title, company);

-- 3. INSERT COURSES
WITH org_id AS (
  SELECT id FROM organizations WHERE slug = 'ledarskapskultur' LIMIT 1
),
admin_user AS (
  SELECT id FROM user_profiles WHERE email = 'anna@ledarskapskultur.se' LIMIT 1
)
INSERT INTO courses (id, organization_id, name, slug, description, learning_objectives, duration_hours, difficulty_level, course_type, is_published, created_by)
SELECT
  gen_random_uuid(),
  org.id,
  course_data.name,
  course_data.slug,
  course_data.description,
  course_data.objectives,
  course_data.hours,
  course_data.level,
  course_data.type,
  true,
  admin.id
FROM org_id org, admin_user admin,
LATERAL (
  VALUES
    ('Introduktion till Ledarskap', 'intro-ledarskap', 'Grundkurs i ledarskap och ledningsfilosofi', ARRAY['Förstå ledares roll', 'Utveckla emotionell intelligens'], 16, 'beginner', 'public'),
    ('Avancerad Ledning', 'advanced-ledning', 'Fördjupad ledarskapsutbildning', ARRAY['Strategisk ledning', 'Organisationsförändring'], 24, 'advanced', 'corporate')
) AS course_data(name, slug, description, objectives, hours, level, type);

-- 4. INSERT COURSE MODULES
WITH courses_cte AS (
  SELECT id, name FROM courses WHERE organization_id = (SELECT id FROM organizations WHERE slug = 'ledarskapskultur')
)
INSERT INTO course_modules (id, course_id, title, description, order_index, duration_hours)
SELECT
  gen_random_uuid(),
  c.id,
  CASE
    WHEN m.order_idx = 1 THEN 'Modul 1: Grunderna'
    WHEN m.order_idx = 2 THEN 'Modul 2: Människor'
    WHEN m.order_idx = 3 THEN 'Modul 3: Praktik'
  END,
  CASE
    WHEN m.order_idx = 1 THEN 'Introduktion till ledarskap'
    WHEN m.order_idx = 2 THEN 'Ledning av människor'
    WHEN m.order_idx = 3 THEN 'Praktiska övningar'
  END,
  m.order_idx,
  CASE WHEN m.order_idx = 3 THEN 8 ELSE 4 END
FROM courses_cte c,
LATERAL (
  VALUES (1), (2), (3)
) AS m(order_idx)
WHERE c.name = 'Introduktion till Ledarskap';

-- 5. INSERT COURSE INSTANCES
WITH org_id AS (
  SELECT id FROM organizations WHERE slug = 'ledarskapskultur' LIMIT 1
),
course_ids AS (
  SELECT id, name FROM courses WHERE organization_id = (SELECT id FROM org_id)
),
contact_id AS (
  SELECT id FROM contacts WHERE email = 'erik@företag.se' LIMIT 1
),
instructor_id AS (
  SELECT id FROM user_profiles WHERE email = 'cissi@ledarskapskultur.se' LIMIT 1
)
INSERT INTO course_instances (id, organization_id, course_id, title, description, start_date, end_date, start_time, end_time, location, max_participants, status, customer_id, lead_instructor_id)
SELECT
  gen_random_uuid(),
  org.id,
  c.id,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN 'Ledarskap VT2025' ELSE 'Avancerad Ledning HT2025' END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN 'Vårkurs i ledarskap' ELSE 'Höstuppdrag för Företag AB' END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN '2025-04-01'::date ELSE '2025-09-01'::date END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN '2025-05-15'::date ELSE '2025-11-30'::date END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN '09:00'::time ELSE '10:00'::time END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN '12:00'::time ELSE '16:00'::time END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN 'Stockholm' ELSE 'Online' END,
  CASE WHEN c.name = 'Introduktion till Ledarskap' THEN 20 ELSE 15 END,
  (CASE WHEN c.name = 'Introduktion till Ledarskap' THEN 'published' ELSE 'draft' END)::course_instance_status,
  contact.id,
  instr.id
FROM org_id org, contact_id contact, instructor_id instr, course_ids c;

-- 6. INSERT ENROLLMENTS
WITH enrollment_data AS (
  SELECT
    ci.id as instance_id,
    p.id as participant_id
  FROM course_instances ci
  JOIN user_profiles p ON p.email = 'david@example.com'
  WHERE ci.title = 'Ledarskap VT2025'
)
INSERT INTO enrollments (id, course_instance_id, participant_id, status, enrollment_date)
SELECT
  gen_random_uuid(),
  instance_id,
  participant_id,
  'confirmed'::enrollment_status,
  now()::date
FROM enrollment_data;

-- 7. INSERT DOCUMENTATION
WITH doc_data AS (
  SELECT
    org.id as org_id,
    contact.id as contact_id,
    ci.id as instance_id,
    admin.id as admin_id,
    instr.id as instr_id
  FROM organizations org
  JOIN contacts contact ON contact.organization_id = org.id AND contact.email = 'erik@företag.se'
  JOIN course_instances ci ON ci.customer_id = contact.id
  JOIN user_profiles admin ON admin.email = 'anna@ledarskapskultur.se'
  JOIN user_profiles instr ON instr.email = 'cissi@ledarskapskultur.se'
  WHERE org.slug = 'ledarskapskultur' AND ci.title = 'Ledarskap VT2025'
  LIMIT 1
)
INSERT INTO documentation (id, organization_id, doc_type, title, description, contact_id, course_instance_id, documented_by, documentation_date, notes, is_shared_with_contact)
SELECT
  gen_random_uuid(),
  org_id,
  doc.doc_type::documentation_type,
  doc.title,
  doc.description,
  contact_id,
  instance_id,
  CASE WHEN doc.doc_type = 'meeting' THEN admin_id ELSE instr_id END,
  now(),
  doc.notes,
  doc.shared
FROM doc_data,
LATERAL (
  VALUES
    ('meeting', 'Kickoff-möte med Företag AB', 'Introduktion av ledarskapsutbildning', 'Diskuterade mål och tidsplan', true),
    ('coaching', 'Coachning: Ledarskapsstil', 'Individuell coachning av David', 'Fokus på delegering och återkoppling', false)
) AS doc(doc_type, title, description, notes, shared);

-- 8. INSERT ASSESSMENT TEMPLATE
WITH org_id AS (
  SELECT id FROM organizations WHERE slug = 'ledarskapskultur' LIMIT 1
),
admin_id AS (
  SELECT id FROM user_profiles WHERE email = 'anna@ledarskapskultur.se' LIMIT 1
)
INSERT INTO assessment_templates (id, organization_id, name, description, assessment_type, is_published, created_by)
SELECT
  gen_random_uuid(),
  org.id,
  'Ledarskapskompetensbedömning',
  'Bedömning av ledarskapsfärdigheter',
  'individual'::assessment_type,
  true,
  admin.id
FROM org_id org, admin_id admin;

-- 9. INSERT ASSESSMENT QUESTIONS
WITH template_id AS (
  SELECT id FROM assessment_templates WHERE name = 'Ledarskapskompetensbedömning' LIMIT 1
)
INSERT INTO assessment_questions (id, template_id, question_text, question_type, order_index, scale_min, scale_max, scale_labels, is_required)
SELECT
  gen_random_uuid(),
  t.id,
  q.question,
  'likert',
  q.order_idx,
  1,
  5,
  ARRAY['Helt oenig', 'Oenig', 'Neutral', 'Enig', 'Helt enig'],
  true
FROM template_id t,
LATERAL (
  VALUES
    ('Jag är skicklig på att delegera uppgifter', 1),
    ('Jag ger regelbunden återkoppling till mitt team', 2)
) AS q(question, order_idx);

-- ============================================
-- ✅ TEST DATA INSERTED
-- ============================================
