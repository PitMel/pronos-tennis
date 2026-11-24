-- Contenus de l'écran d'ouverture (migration 0031). Ne contient aucun secret.
-- À exécuter UNE SEULE FOIS dans le SQL Editor de Supabase, APRÈS la migration 0031 (sinon les contenus seraient en double).
-- Les images sont dans web/images/ouverture/ (publiées avec le site). Ajouter ensuite d'autres lignes de la même façon.
-- Interrupteur de l'écran : update public.ecran_ouverture_reglage set actif = true;   (false pour l'éteindre)

-- Images fournies par Pierre (21 nov. 2026) ; le nom du fichier est la légende, un simple chiffre = pas de légende
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('image', 'Medvedev-Tiafoe, ATPF 2026', null, null, './images/ouverture/medvedev-tiafoe-atpf-2026.jpg', true),
  ('image', 'Roger Federer - Wimbledon 2003', null, null, './images/ouverture/federer-wimbledon-2003.jpg', true),
  ('image', 'Carlos Alcaraz - Wimbledon 2025', null, null, './images/ouverture/alcaraz-wimbledon-2025.jpg', true),
  ('image', 'La Monf as Superman 2021', null, null, './images/ouverture/la-monf-as-superman-2021.jpg', true),
  ('image', 'Roger Federer - Roland Garros 2009', null, null, './images/ouverture/roger-federer-roland-garros-2009.jpg', true),
  ('image', null, null, null, './images/ouverture/sans-legende-2.jpg', true),
  ('image', 'Novak Djokovic - Wimbledon 2024', null, null, './images/ouverture/novak-djokovic-wimbledon-2024.jpg', true),
  ('image', null, null, null, './images/ouverture/sans-legende-1.jpg', true),
  ('image', 'Big Boys don’t cry - Laver Cup 2022', null, null, './images/ouverture/big-boys-dont-cry-2003.jpg', true),
  ('image', null, null, null, './images/ouverture/sans-legende-3.jpg', true),
  ('image', null, null, null, './images/ouverture/sans-legende-4.jpg', true),
  ('image', 'Dream of a life Andy Murray 2021', null, null, './images/ouverture/dream-of-a-life-andy-murray-2021.jpg', true);

-- Citations (21 nov. 2026)
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('citation', 'Dix Grands Chelems.', 'Pete Sampras', 'quand on lui demande quelle est la différence entre lui et Patrick Rafter', null, true),
  ('citation', 'J’ai plus de talent dans mon petit doigt que Lendl dans tout son corps.', 'John McEnroe', null, null, true),
  ('citation', 'Ça fait un record de plus à mon actif. Mais vous savez, j’en ai déjà tellement…', 'Martina Hingis', 'devenant la plus jeune joueuse à gagner un tournoi du Grand Chelem, en 1997 (Open d’Australie), à 16 ans, 3 mois et 26 jours', null, true),
  ('citation', 'Si je ne gagne pas deux Grands Chelems dans la saison, ce n’est pas une bonne année.', 'Pete Sampras', null, null, true),
  ('citation', 'Je suis la meilleure joueuse du monde. Tant que personne ne me passera devant, j’aurai le droit d’être arrogante.', 'Martina Hingis', null, null, true),
  ('citation', 'Je suis comme un menu dans un grand restaurant. Vous pouvez regarder, mais vous n’avez pas les moyens de vous le payer.', 'Anna Kournikova', null, null, true),
  ('citation', 'Ma plus grande qualité, c’est que je n’ai aucun défaut.', 'John McEnroe', null, null, true),
  ('citation', 'Il ne faut pas lire ton journal quand je joue. Hey, ne lis pas quand je joue !', 'Jim Courier', 's’adressant à un spectateur à Roland-Garros en 1993', null, true),
  ('citation', 'J’admets que Kournikova est plutôt jolie, mais je suis sûre qu’elle échangerait volontiers sa place contre la mienne si elle pouvait avoir quatre titres du Grand Chelem à son palmarès.', 'Martina Hingis', 'en 1998', null, true),
  ('citation', 'Si c’était si facile de faire le Grand Chelem à mon époque, pourquoi personne d’autre ne l’a fait ?', 'Donald Budge', null, null, true),
  ('citation', 'Il y a des centaines de jeunes joueuses comme Steffi Graf aux États-Unis, je doute de ses capacités.', 'Tracy Austin', 'en 1982', null, true),
  ('citation', 'Le plus dur, c’est à l’échauffement, quand ils égrènent son palmarès. Là, il vaut mieux se boucher les oreilles.', 'Paul-Henri Mathieu', 'à propos de Roger Federer', null, true),
  ('citation', 'Je ne voudrais pas passer pour un paranoïaque, mais il me semble que le juge de ligne électronique sait qui je suis.', 'John McEnroe', null, null, true),
  ('citation', 'Pourtant j’ai bien débuté la partie, le premier point était extraordinaire.', 'Tim Henman', 'après une grosse défaite contre Pete Sampras', null, true),
  ('citation', 'J’ai essayé de jouer intelligemment, ça ne m’a pas réussi. Ce n’est pas mon jeu.', 'Marat Safin', null, null, true),
  ('citation', 'J’ai joué sur son coup droit et il m’a fait un passing. J’ai joué sur son revers et il m’a fait un passing. Je suis resté sur la ligne de fond et il a quand même réussi à me faire un passing.', 'Andy Roddick', 'à propos de Roger Federer après la finale de Wimbledon 2005', null, true),
  ('citation', 'Lendl m’a dit que je lui faisais penser à un de ses chiens.', 'Todd Woodbridge', null, null, true),
  ('citation', 'Travailler le physique, c’est dur, mais en Suède, je n’ai rien d’autre à faire !', 'Magnus Larsson', null, null, true),
  ('citation', 'Je ne suis pas là pour respecter mes adversaires. Je suis là pour les humilier.', 'Jimmy Connors', null, null, true),
  ('citation', 'Il faudrait que je gagne de temps en temps contre lui pour qu’on puisse parler de rivalité.', 'Andy Roddick', 'au sujet de Roger Federer', null, true),
  ('citation', 'Même s’il faisait 45 degrés et que j’étais sur mon lit de mort, tu n’arriverais pas à me battre.', 'Ivan Lendl', 'à Brad Gilbert', null, true),
  ('citation', 'Si l’enfant de Pete est une fille, mon fils l’aimera. Si l’enfant de Pete est un garçon, mon fils le battra.', 'Andre Agassi', null, null, true),
  ('citation', 'Je ne sais pas si Navratilova est la meilleure joueuse de tennis de tous les temps, mais ce que je sais, c’est que c’est la plus grande joueuse de simple qui ait jamais existé. Et de double. Et aussi de double mixte.', 'Billie Jean King', null, null, true),
  ('citation', 'Jouer contre Nadal à Roland-Garros, c’est un peu comme être en plein milieu du Sahara sans nourriture et sans eau. Il y a très peu de chances de s’en sortir.', 'Kevin Kim', null, null, true),
  ('citation', 'La meilleure équipe de double au monde, c’est John McEnroe associé à n’importe quel autre joueur.', 'Peter Fleming', 'partenaire de double de McEnroe', null, true),
  ('citation', 'Jim Courier ne lâche jamais la pression. Il se bat sur chaque point de chaque jeu de chaque set. Je suis sûr qu’il a la même détermination pour se brosser les dents.', 'Brad Gilbert', null, null, true),
  ('citation', 'C’est simple, nous utilisons un instrument à cordes et lui, c’est un virtuose.', 'Andy Roddick', 'à propos de Roger Federer', null, true),
  ('citation', 'Federer est le meilleur joueur de tous les temps, mais Nadal est le meilleur des deux.', 'Martina Navratilova', null, null, true),
  ('citation', 'Mon problème, c’est qu’à chaque match je dois me battre contre cinq adversaires : l’arbitre, le public, les ramasseurs de balle, le filet, et moi-même. C’est pour ça que, parfois, mon esprit est un peu ailleurs.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Chaque génération a son Goran. Moi, je suis le Goran de cette génération.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Ils ont égaré ma page. Quelqu’un l’a arrachée. Mais je suis quand même le sponsor principal de l’ATP Tour ! C’est moi qui paye le plus d’amendes, ils devraient faire preuve d’un peu plus de respect ! Maintenant, comme je n’existe plus, je suis un fantôme, je peux faire ce que je veux.', 'Goran Ivanisevic', 'après avoir été oublié dans le guide des joueurs ATP 2004', null, true),
  ('citation', 'Quand je gagne un match, le lendemain, je vais dans le même restaurant et je mange la même chose. Quand je vais en finale d’un tournoi, ça peut vite devenir pénible.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'J’ai été surpris que ma raquette ait cassé aussi facilement. Il doit y avoir un problème, elle n’est pas assez solide, ou alors c’est moi qui suis trop fort.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'J’ai changé mon approche mentale. J’avais besoin d’une conférence de presse avec moi-même.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Sur gazon, si mon service ne passe pas, je ne suis bon qu’à tondre la pelouse.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Plus je joue mal, plus les gens m’apprécient. C’est incompréhensible.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Les observateurs disent que je n’ai qu’un seul coup, mon service. Si c’est vrai, soit je suis un génie, soit les autres sont très mauvais.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Ivan Lendl ne gagnera jamais Wimbledon parce qu’il ne monte jamais au filet, si ce n’est pour serrer la main de son adversaire.', 'Goran Ivanisevic', null, null, true),
  ('citation', 'Et que ça lui serve de leçon ! Personne ne bat Vitas Gerulaitis dix-sept fois de suite.', 'Vitas Gerulaitis', 'après avoir battu Connors à l’issue de 16 défaites d’affilée', null, true),
  ('citation', 'Le système du classement ATP est tellement bien fait qu’on peut être mort et toujours numéro un mondial.', 'Pete Sampras', null, null, true),
  ('citation', 'En 1997, mon meilleur résultat, ça a été mon mariage avec Brooke Shields.', 'Andre Agassi', null, null, true),
  ('citation', 'Chez les amateurs, le meilleur moment pour commettre une double faute se situe juste après un ace. Lequel, de l’ace ou de la double faute, était accidentel ?', 'Brad Gilbert', null, null, true),
  ('citation', 'Après avoir perdu un match, je me suis souvent dit qu’il fallait que j’arrête le tennis. Mais ça, c’était dans les bons jours. Parfois, j’avais juste envie de me suicider.', 'Ivan Lendl', null, null, true),
  ('citation', 'Je déteste la défaite plus que j’aime la victoire. Je ne supporte pas de lire le moindre signe de satisfaction sur le visage de mon adversaire.', 'Jimmy Connors', null, null, true),
  ('citation', 'Si vous voulez assister à un match avec des crises de colère et des grands moments de rigolade, il vaut mieux éviter de venir me voir jouer.', 'Ivan Lendl', null, null, true),
  ('citation', 'Mes chances de gagner l’US Open cette année sont les mêmes que celles de tous les joueurs qui ne se prénomment pas Roger.', 'Andy Roddick', null, null, true),
  ('citation', 'Mon record de 14 titres à Roland-Garros sera plus difficile à battre que les 24 Grands Chelems de Djokovic.', 'Rafael Nadal', null, null, true),
  ('citation', 'Si moi je suis fatigué, c’est que le gars en face est mort.', 'Rafael Nadal', 'en 2005, en réponse à un journaliste qui lui demandait comment il gère sa fatigue', null, true);

-- Statistiques (21 nov. 2026)
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('info', 'Thomas Muster, n° 1 mondial et vainqueur de 44 titres sur le circuit, n’a jamais gagné un seul match à Wimbledon.', null, null, null, true),
  ('info', 'Andy Murray a eu plus de succès à Roland-Garros (76,5 % de victoires) qu’à l’Open d’Australie (76,1 %).', null, null, null, true),
  ('info', 'Patrick Rafter, n° 1 mondial pendant une semaine, n’a jamais eu l’occasion de jouer un match officiel avec le classement de n° 1.', null, null, null, true),
  ('info', 'Pendant l’ère Open, aucun joueur n’a gagné le tournoi du Grand Chelem suivant son premier titre en Grand Chelem.', null, null, null, true),
  ('info', 'Novak Djokovic a remporté 3 des 4 tournois du Grand Chelem en 2011, 2015, 2021 et 2023. Ces années-là, il n’a pourtant jamais perdu contre Nadal à Roland-Garros.', null, null, null, true);

-- Statistiques ajoutées le 21 nov. 2026 (17 h), avec emojis
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('info', '👑 29 joueuses ont été n° 1 mondiales WTA. Au cours de sa carrière, Serena Williams a battu au moins une fois 23 d’entre elles. Elle n’a jamais affronté les 5 joueuses qui manquent à son tableau de chasse.', null, null, null, true),
  ('info', '🟠 Rafael Nadal a remporté plus de titres sur terre battue qu’il n’a perdu de matchs sur cette surface.', null, null, null, true),
  ('info', '🎾 Dans 49,7 % des matchs ATP et 54,1 % des matchs WTA, le vainqueur du premier point a finalement remporté le match.', null, null, null, true);

-- Images fournies par Pierre (23 nov. 2026) ; le nom du fichier est la légende, un simple chiffre = pas de légende
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('image', 'Tous à l’école de Rafa - 2026', null, null, './images/ouverture/tous-a-l-ecole-de-rafa-2026.jpg', true),
  ('image', 'C’est à moi que tu parles ?! - Flavio Cobolli 2026', null, null, './images/ouverture/cobolli-c-est-a-moi-que-tu-parles-2026.jpg', true),
  ('image', 'Ouch....', null, null, './images/ouverture/ouch.jpg', true),
  ('image', 'Long live the King - Nadal Roland Garros 2024', null, null, './images/ouverture/long-live-the-king-nadal-roland-garros-2024.jpg', true),
  ('image', null, null, null, './images/ouverture/sans-legende-5.jpg', true),
  ('image', null, null, null, './images/ouverture/sans-legende-6.jpg', true),
  ('image', 'King of Clay is born - Nadal Roland Garros 2005', null, null, './images/ouverture/king-of-clay-is-born-nadal-roland-garros-2005.jpg', true),
  ('image', 'La Résurrection - Roger Federer Open d’Australie 2017', null, null, './images/ouverture/la-resurrection-roger-federer-open-d-australie-2017.jpg', true),
  ('image', 'Dans 5 ans... - Rafael Nadal Petits As 2000', null, null, './images/ouverture/dans-5-ans-rafael-nadal-petits-as-2000.jpg', true),
  ('image', 'Dieu qu’il était laid - Roger Federer Marseille Open 2000', null, null, './images/ouverture/dieu-qu-il-etait-laid-roger-federer-marseille-open-2000.jpg', true);

-- Statistiques ajoutées le 23 nov. 2026 (retours à la ligne respectés à l'affichage)
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('info', '🏆 Meilleur ratio titres / participations en Grand Chelem (hors forfaits) :
🥇 Björn Borg : 11/27 (40,7 %)
🥈 Rafael Nadal : 22/66 (33,3 %)
🥉 Novak Djokovic : 24/84 (28,6 %)
4️⃣ Pete Sampras : 14/52 (26,9 %)
5️⃣ Roger Federer : 20/80 (25,0 %)
6️⃣ John McEnroe : 7/45 (15,6 %)', null, 'Chiffres de Novak Djokovic à fin 2026', null, true),
  ('info', '🤕 Sur ses 21 années de joueur professionnel (hors pandémie), Rafael Nadal a déclaré forfait 7 fois à Wimbledon, soit une année sur trois. En comparaison : 6 fois à l’US Open, et 4 fois à Roland-Garros comme à l’Open d’Australie.', null, null, null, true);

-- Statistiques ajoutées le 24 nov. 2026 (séries en Grand Chelem d'après les tableaux de Pierre ; podium en Masters 1000)
insert into public.ecran_ouverture_contenus (type, texte, auteur, source, image_url, actif) values
  ('info', '🏆 Séries record de finales consécutives disputées en Grand Chelem (hommes) :
🥇 Roger Federer : 10 (2005-2007)
🥈 Roger Federer : 8 (2008-2010)
🥉 Novak Djokovic : 6 (2015-2016)
4️⃣ Rafael Nadal : 5 (2011-2012)
4️⃣ Novak Djokovic : 5 (2020-2021)
4️⃣ Jannik Sinner : 5 (2024-2025)', null, null, null, true),
  ('info', '🏆 Séries record de demi-finales consécutives disputées en Grand Chelem (hommes) :
🥇 Roger Federer : 23 (2004-2010)
🥈 Novak Djokovic : 14 (2010-2013)
🥉 Ivan Lendl : 10 (1985-1988)
4️⃣ Novak Djokovic : 9 (2014-2016)
5️⃣ Rafael Nadal : 7 (2018-2019)
6️⃣ Ivan Lendl : 6 (1983-1984)
6️⃣ Jannik Sinner : 6 (2024-2026)', null, null, null, true),
  ('info', '🏆 Séries record de quarts de finale consécutifs disputés en Grand Chelem (hommes) :
🥇 Roger Federer : 36 (2004-2013)
🥈 Novak Djokovic : 28 (2009-2016)
🥉 Ivan Lendl : 14 (1985-1989)
4️⃣ Rafael Nadal : 11 (2009-2012)', null, null, null, true),
  ('info', '🏆 En Masters 1000, Djokovic, Nadal et Federer occupent le podium, toujours dans cet ordre, pour les records de titres, de finales, de demi-finales, de matchs joués et de matchs remportés :
🥇 Novak Djokovic
🥈 Rafael Nadal
🥉 Roger Federer', null, null, null, true);
