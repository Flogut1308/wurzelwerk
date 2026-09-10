# Fixture „adoption"

Ein Kind mit drei Elternkanten gleichzeitig: eine biologische (zur leiblichen Mutter, Vater bewusst
unbekannt/nicht modelliert) und zwei adoptive (zu den Adoptiveltern) — plus zwei Namenszeilen
(Geburtsname und späterer Ehename/Adoptivname), von denen nur einer `ist_bevorzugt`. Trägt jeden
Test, der annimmt, eine Person habe höchstens zwei Elternkanten oder genau einen bevorzugten Namen:
beide Annahmen sind hier bewusst falsch. Die Zyklusprüfung muss weiterhin `hatZyklus === false`
liefern, obwohl die Person drei statt zwei Elternteile hat.
