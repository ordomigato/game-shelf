-- Orders digits by value ("Final Fantasy 2" before "Final Fantasy 10") when
-- the list pages sort by a name, platform, collection or text field.
CREATE COLLATION IF NOT EXISTS "natural_sort" (provider = icu, locale = 'und-u-kn-true');
