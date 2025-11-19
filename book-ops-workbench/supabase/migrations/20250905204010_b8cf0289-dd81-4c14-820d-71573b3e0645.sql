-- Add column for hierarchy bookings account ARR converted
ALTER TABLE public.accounts 
ADD COLUMN hierarchy_bookings_arr_converted numeric DEFAULT 0;