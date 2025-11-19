-- Populate renewal_quarter in accounts table based on opportunities.renewal_event_date
-- Fiscal year: Q1 = Feb-Apr, Q2 = May-Jul, Q3 = Aug-Oct, Q4 = Nov-Jan

UPDATE accounts a
SET renewal_quarter = (
  SELECT CASE 
    WHEN EXTRACT(MONTH FROM o.renewal_event_date) IN (2, 3, 4) THEN 'Q1'
    WHEN EXTRACT(MONTH FROM o.renewal_event_date) IN (5, 6, 7) THEN 'Q2'
    WHEN EXTRACT(MONTH FROM o.renewal_event_date) IN (8, 9, 10) THEN 'Q3'
    WHEN EXTRACT(MONTH FROM o.renewal_event_date) IN (11, 12, 1) THEN 'Q4'
    ELSE NULL
  END
  FROM opportunities o
  WHERE o.sfdc_account_id = a.sfdc_account_id
    AND o.build_id = a.build_id
    AND o.renewal_event_date IS NOT NULL
    AND LOWER(TRIM(o.opportunity_type)) = 'renewals'
  ORDER BY o.renewal_event_date ASC
  LIMIT 1
)
WHERE a.is_customer = true
  AND EXISTS (
    SELECT 1 FROM opportunities o
    WHERE o.sfdc_account_id = a.sfdc_account_id
      AND o.build_id = a.build_id
      AND o.renewal_event_date IS NOT NULL
      AND LOWER(TRIM(o.opportunity_type)) = 'renewals'
  );