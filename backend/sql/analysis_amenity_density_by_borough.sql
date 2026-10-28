-- Amenity counts per borough (mapped inventory density).
SELECT
  d.id AS district_id,
  d.name AS district_name,
  (SELECT COUNT(*)::int FROM trees t WHERE t.district_id = d.id) AS trees,
  (SELECT COUNT(*)::int FROM park_trees pt WHERE pt.district_id = d.id) AS park_trees,
  (SELECT COUNT(*)::int FROM bike_parking b WHERE b.district_id = d.id) AS bike_parking,
  (SELECT COUNT(*)::int FROM ev_chargers e WHERE e.district_id = d.id) AS ev_chargers,
  (SELECT COUNT(*)::int FROM drinking_fountains f WHERE f.district_id = d.id) AS drinking_fountains,
  (SELECT COUNT(*)::int FROM bathing_waters w WHERE w.district_id = d.id) AS bathing_waters,
  (SELECT COUNT(*)::int FROM toilets o WHERE o.district_id = d.id) AS toilets,
  (SELECT COUNT(*)::int FROM playgrounds p WHERE p.district_id = d.id) AS playgrounds,
  (SELECT COUNT(*)::int FROM sports_facilities sf WHERE sf.district_id = d.id) AS sports_facilities,
  (SELECT COUNT(*)::int FROM kitas k WHERE k.district_id = d.id) AS kitas,
  (SELECT COUNT(*)::int FROM hospitals h WHERE h.district_id = d.id) AS hospitals,
  (SELECT COUNT(*)::int FROM cemeteries c WHERE c.district_id = d.id) AS cemeteries,
  (SELECT COUNT(*)::int FROM park_and_ride pr WHERE pr.district_id = d.id) AS park_and_ride
FROM districts d
ORDER BY d.name;
