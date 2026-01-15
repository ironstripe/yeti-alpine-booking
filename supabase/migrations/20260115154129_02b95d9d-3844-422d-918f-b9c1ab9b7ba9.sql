-- Assign admin role to existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role 
FROM auth.users 
WHERE email IN ('christoph@powersurf.li')
ON CONFLICT (user_id, role) DO NOTHING;