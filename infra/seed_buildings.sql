-- Seed ~UCSD buildings (Person C can expand). Safe to re-run.
INSERT INTO buildings (name, aliases, lat, lng) VALUES
('Price Center East', ARRAY['PC East','PC','Price Center'], 32.8797, -117.2358),
('Price Center West', ARRAY['PC West','PC West Ballroom','Price Center West Ballroom'], 32.8798, -117.2370),
('Geisel Library', ARRAY['Geisel','the library'], 32.8811, -117.2376),
('CSE Building', ARRAY['CSE','EBU3B','Computer Science'], 32.8818, -117.2335),
('Warren Lecture Hall', ARRAY['WLH','Warren Lecture'], 32.8807, -117.2343),
('Center Hall', ARRAY['Center'], 32.8775, -117.2373),
('Student Services Center', ARRAY['SSC'], 32.8786, -117.2350),
('RIMAC', ARRAY['RIMAC Arena','RIMAC Field'], 32.8855, -117.2397),
('Library Walk', ARRAY['Lib Walk'], 32.8790, -117.2368),
('Sixth College', ARRAY['Sixth','NTPLLN'], 32.8826, -117.2421),
('Muir College', ARRAY['Muir','Muir Quad'], 32.8784, -117.2412),
('Revelle Plaza', ARRAY['Revelle','Revelle Fountain'], 32.8745, -117.2410),
('Warren College', ARRAY['Warren'], 32.8815, -117.2330),
('Marshall College', ARRAY['Marshall'], 32.8780, -117.2418),
('ERC', ARRAY['Earl Warren','Roosevelt'], 32.8852, -117.2425),
('Pepper Canyon Hall', ARRAY['PCYH'], 32.8789, -117.2395),
('York Hall', ARRAY['York'], 32.8748, -117.2398),
('Mandeville Auditorium', ARRAY['Mandeville'], 32.8782, -117.2390),
('Price Center Ballroom', ARRAY['PC Ballroom','East Ballroom','West Ballroom'], 32.8797, -117.2364),
('Sun God Lawn', ARRAY['Sun God'], 32.8785, -117.2398)
ON CONFLICT (name) DO UPDATE SET
  aliases = EXCLUDED.aliases,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng;
