DO $$
BEGIN
    -- Only insert profile if the user exists in auth.users (Prevents FK violation)
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = '796ffe20-7758-4392-8647-42a8a018d654') THEN
        INSERT INTO public.profiles (id, email, role, region, full_name, created_at, updated_at)
        VALUES (
          '796ffe20-7758-4392-8647-42a8a018d654',
          'nina.maswadeh@pendo.io',
          'REVOPS'::user_role,
          'GLOBAL',
          'Nina Maswadeh',
          now(),
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          role = 'REVOPS'::user_role,
          region = 'GLOBAL',
          updated_at = now();
    END IF;
END $$;