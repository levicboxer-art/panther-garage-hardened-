export const LOCALES = ["en", "rw", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_STORAGE_KEY = "pgms-locale";

export const LOCALE_LABELS: Record<Locale, { label: string; short: string; htmlLang: string }> = {
  en: { label: "English", short: "EN", htmlLang: "en" },
  rw: { label: "Kinyarwanda", short: "RW", htmlLang: "rw" },
  fr: { label: "Français", short: "FR", htmlLang: "fr" },
};

type Dictionary = Record<string, string>;

/**
 * English is the source language. Components keep their current English text;
 * the runtime translator looks up an exact phrase and leaves unknown text
 * untouched, so database values (product names, references) are never altered.
 */
const fr: Dictionary = {
  Home: "Accueil",
  "Spare parts": "Pièces détachées",
  Services: "Services",
  Portal: "Portail",
  Contact: "Contact",
  "About us": "À propos",
  "Staff login": "Connexion personnel",
  "Customer portal": "Portail client",
  "Back to website": "Retour au site",
  "Back to parts": "Retour aux pièces",
  Search: "Rechercher",
  "Search parts…": "Rechercher des pièces…",
  "Search products, SKU, category…": "Rechercher produits, SKU, catégorie…",
  "Name, SKU, model, keyword…": "Nom, SKU, modèle, mot-clé…",
  "Search spare parts": "Rechercher des pièces détachées",
  Filters: "Filtres",
  Filter: "Filtrer",
  Sort: "Trier",
  "Sort: name": "Trier : nom",
  "Sort: price low to high": "Trier : prix croissant",
  "Sort: price high to low": "Trier : prix décroissant",
  "Sort: recently updated": "Trier : récemment mis à jour",
  "Sort: available first": "Trier : disponible d'abord",
  All: "Tous",
  "All motorcycles": "Toutes les motos",
  "Any availability": "Toute disponibilité",
  "Available now": "Disponible maintenant",
  "In stock": "En stock",
  "Out of stock": "Rupture de stock",
  "Low stock": "Stock faible",
  "Check availability": "Vérifier la disponibilité",
  "Price on request": "Prix sur demande",
  "PRICE NEEDS REVIEW": "PRIX À VÉRIFIER",
  "Price needs review": "Prix à vérifier",
  "Confirmed price": "Prix confirmé",
  "Selling price not published": "Prix de vente non publié",
  Category: "Catégorie",
  Compatibility: "Compatibilité",
  SKU: "SKU",
  "Last catalogue update:": "Dernière mise à jour du catalogue :",
  "Last catalogue update": "Dernière mise à jour du catalogue",
  "THE PARTS COUNTER": "LE COMPTOIR DES PIÈCES",
  "Find what keeps you": "Trouvez ce qui vous fait",
  "moving.": "avancer.",
  "YOUR RIDE. OUR PRIORITY.": "VOTRE TRAJET. NOTRE PRIORITÉ.",
  "BUILT FOR": "CONÇU POUR",
  "THE RIDE.": "LA ROUTE.",
  "Quality motorcycle spare parts, rider essentials and dependable workshop service — everything your motorcycle needs, in one place.":
    "Des pièces de moto de qualité, des équipements pour pilotes et un service d'atelier fiable — tout ce dont votre moto a besoin, au même endroit.",
  "Explore spare parts": "Découvrir les pièces",
  "Book a repair": "Réserver une réparation",
  "Quality parts": "Pièces de qualité",
  "Skilled service": "Service qualifié",
  "Rider first": "Le pilote d'abord",
  "SPARE PARTS": "PIÈCES DÉTACHÉES",
  "RIDER GEAR": "ÉQUIPEMENT PILOTE",
  "MECHANICAL REPAIRS": "RÉPARATIONS MÉCANIQUES",
  "ELECTRIC & FUEL MOTORCYCLES": "MOTOS ÉLECTRIQUES ET THERMIQUES",
  RWANDA: "RWANDA",
  "The supplier catalogue migration has not been applied yet. Availability and confirmed prices may be limited until the database is updated.":
    "La migration du catalogue fournisseur n'a pas encore été appliquée. La disponibilité et les prix confirmés peuvent être limités jusqu'à la mise à jour de la base de données.",
  "No matching products. Try another search.":
    "Aucun produit correspondant. Essayez une autre recherche.",
  "No matching parts. Try a different search, model or availability filter.":
    "Aucune pièce correspondante. Essayez une autre recherche, un autre modèle ou un autre filtre de disponibilité.",
  "Clear filters": "Effacer les filtres",
  "Genuine spare part stocked by Panther Garage.":
    "Pièce détachée authentique en stock chez Panther Garage.",
  "Request list": "Liste de demandes",
  "Your request list": "Votre liste de demandes",
  "Your request list is empty.": "Votre liste de demandes est vide.",
  "Submit request": "Envoyer la demande",
  "Submitting…": "Envoi…",
  "Request received": "Demande reçue",
  "Request this part": "Demander cette pièce",
  "Ordering is paused for this part": "La commande est suspendue pour cette pièce",
  "Contact the garage": "Contacter le garage",
  Reference: "Référence :",
  "Total": "Total",
  "Your full name": "Votre nom complet",
  "Phone number": "Numéro de téléphone",
  "Email (optional)": "E-mail (facultatif)",
  "Collection, delivery or motorcycle details (optional)":
    "Détails de retrait, livraison ou moto (facultatif)",
  "Close": "Fermer",
  "Remove": "Retirer",
  "Add": "Ajouter",
  "Save": "Enregistrer",
  "Cancel": "Annuler",
  "Delete": "Supprimer",
  "Edit": "Modifier",
  "Loading…": "Chargement…",
  "No data": "Aucune donnée",
  "STAFF ACCESS": "ACCÈS PERSONNEL",
  "THE GARAGE": "LE GARAGE",
  COMMAND: "DE COMMANDES",
  CENTER: "CENTRAL",
  "CENTER.": "CENTRAL.",
  "One secure workspace for stock, sales, workshop operations and business control.":
    "Un espace sécurisé pour le stock, les ventes, les opérations d'atelier et le pilotage de l'entreprise.",
  "PANTHER GARAGE MANAGEMENT SYSTEM · PGMS": "SYSTÈME DE GESTION PANTHER GARAGE · PGMS",
  "Welcome back.": "Bon retour.",
  "Sign in using your staff account.": "Connectez-vous avec votre compte personnel.",
  "Email address": "Adresse e-mail",
  "Password": "Mot de passe",
  "Sign in to dashboard": "Se connecter au tableau de bord",
  "Signing in…": "Connexion…",
  "Only Boss-created staff accounts can access the management system. Public self-registration is disabled.":
    "Seuls les comptes créés par le Boss peuvent accéder au système de gestion. L'inscription publique est désactivée.",
  "Sign-in failed. Check your email and password, or ask the boss to activate your account.":
    "Connexion échouée. Vérifiez votre e-mail et votre mot de passe, ou demandez au boss d'activer votre compte.",
  "Your staff profile is not active. Contact the boss.":
    "Votre profil personnel n'est pas actif. Contactez le boss.",
  "CUSTOMER SELF-SERVICE": "SERVICE CLIENT EN AUTONOMIE",
  "Your garage,": "Votre garage,",
  "within reach.": "à portée de main.",
  "Track a repair": "Suivre une réparation",
  "Repair appointment request": "Demande de rendez-vous de réparation",
  "Submitting a request does not confirm an appointment. The garage will contact you.":
    "L'envoi d'une demande ne confirme pas un rendez-vous. Le garage vous contactera.",
  "Your full name *": "Votre nom complet *",
  "Phone number *": "Numéro de téléphone *",
  "Motorcycle make": "Marque de la moto",
  "Motorcycle model": "Modèle de la moto",
  "Registration number": "Numéro d'immatriculation",
  "Reported issue": "Problème signalé",
  "Preferred date": "Date souhaitée",
  "Job number": "Numéro de réparation",
  "Track repair": "Suivre la réparation",
  "WORKSPACE": "ESPACE DE TRAVAIL",
  "BOSS ACCOUNT": "COMPTE BOSS",
  "EMPLOYEE ACCOUNT": "COMPTE EMPLOYÉ",
  "Access is enforced by Supabase Row Level Security and server-side checks.":
    "L'accès est contrôlé par la sécurité au niveau des lignes Supabase et par des vérifications côté serveur.",
  "Refresh data": "Actualiser les données",
  "Sign out": "Déconnexion",
  "PANTHER GARAGE · RWANDA": "PANTHER GARAGE · RWANDA",
  "Good work starts with a clear view.": "Le bon travail commence par une vision claire.",
  "Live product and inventory records from your garage database.":
    "Données produits et stock en direct depuis la base de données du garage.",
  "Employees": "Employés",
  "Import workbooks": "Importer des classeurs",
  "Product register": "Registre produits",
  Overview: "Aperçu",
  Inventory: "Inventaire",
  Import: "Importer",
  Sales: "Ventes",
  Repairs: "Réparations",
  Customers: "Clients",
  Bookings: "Réservations",
  "Online Orders": "Commandes en ligne",
  Purchases: "Achats",
  Restocking: "Réapprovisionnement",
  Reports: "Rapports",
  Settings: "Paramètres",
  "Products in catalogue": "Produits au catalogue",
  "Physical stock units": "Unités en stock physique",
  "Low-stock alerts": "Alertes de stock faible",
  "Active staff role": "Rôle du personnel actif",
  "Live database records": "Enregistrements en direct",
  "Across recorded batches": "Tous lots enregistrés",
  "At or below minimum level": "Au niveau minimum ou en dessous",
  "Verified staff profile": "Profil du personnel vérifié",
  "Inventory overview": "Aperçu de l'inventaire",
  "Physical stock from FIFO batches": "Stock physique issu des lots FIFO",
  "View inventory →": "Voir l'inventaire →",
  "No products yet. Register your first product.":
    "Aucun produit pour le moment. Enregistrez votre premier produit.",
  "Attention required": "Attention requise",
  "Products that need a restock review": "Produits à revoir pour le réapprovisionnement",
  "No low-stock products.": "Aucun produit en stock faible.",
  "Restock alerts use actual batch stock.":
    "Les alertes de réapprovisionnement utilisent le stock réel des lots.",
  "Employee accounts": "Comptes employés",
  "Only BOSS can create or deactivate EMPLOYEE accounts.":
    "Seul le BOSS peut créer ou désactiver des comptes EMPLOYÉ.",
  "Add employee": "Ajouter un employé",
  EMPLOYEE: "EMPLOYÉ",
  "ACCOUNT TYPE": "TYPE DE COMPTE",
  STATUS: "STATUT",
  CREATED: "CRÉÉ",
  ACTION: "ACTION",
  Active: "Actif",
  Inactive: "Inactif",
  Deactivate: "Désactiver",
  Reactivate: "Réactiver",
  "No employee accounts found.": "Aucun compte employé trouvé.",
  "STAFF MANAGEMENT": "GESTION DU PERSONNEL",
  "Create employee account": "Créer un compte employé",
  "Employee full name": "Nom complet de l'employé",
  "Employee email": "E-mail de l'employé",
  "Temporary password (minimum 12 characters)":
    "Mot de passe temporaire (minimum 12 caractères)",
  "This always creates an EMPLOYEE account. The employee should change the temporary password after first login.":
    "Cela crée toujours un compte EMPLOYÉ. L'employé doit changer le mot de passe temporaire après sa première connexion.",
  "Saving…": "Enregistrement…",
  "Create employee": "Créer l'employé",
  "module": "module",
  "This module is in the implementation roadmap. Use the available workspace modules to manage your garage operations.":
    "Ce module est dans la feuille de route. Utilisez les modules disponibles pour gérer les opérations du garage.",
  "Connected application layer": "Couche applicative connectée",
  "Refresh to load latest records": "Actualisez pour charger les derniers enregistrements",
  "Could not refresh products.": "Impossible d'actualiser les produits.",
  "Could not load employees.": "Impossible de charger les employés.",
  "Could not create employee.": "Impossible de créer l'employé.",
  "Could not update employee.": "Impossible de mettre à jour l'employé.",
  "Employee account created.": "Compte employé créé.",
  "Employee reactivated.": "Employé réactivé.",
  "Employee deactivated.": "Employé désactivé.",
  "Light mode": "Mode clair",
  "Dark mode": "Mode sombre",
  "Toggle light and dark mode": "Basculer entre le mode clair et sombre",
  Language: "Langue",

  /* Storefront copy */
  "PARTS • SERVICE • PERFORMANCE": "PIÈCES • SERVICE • PERFORMANCE",
  "Parts • Service • Performance": "Pièces • Service • Performance",
  "Browse approved parts currently listed by the garage. Prices appear only after the garage has confirmed them; unavailable items are clearly marked.":
    "Parcourez les pièces approuvées actuellement proposées par le garage. Les prix n'apparaissent qu'après confirmation par le garage ; les articles indisponibles sont clairement signalés.",
  "MORE THAN A PARTS SHOP": "PLUS QU'UN MAGASIN DE PIÈCES",
  "Workshop care. Done right.": "L'entretien d'atelier. Bien fait.",
  "Diagnostics, engine work, brake servicing and routine maintenance.":
    "Diagnostics, travaux moteur, entretien des freins et maintenance de routine.",
  Enquire: "Se renseigner",
  "Electric motorcycle care": "Entretien des motos électriques",
  "Practical servicing for electric and conventional motorcycles.":
    "Entretien pratique pour motos électriques et thermiques.",
  "Rider equipment": "Équipement pilote",
  "Helmets, protective gear and useful riding accessories.":
    "Casques, équipements de protection et accessoires utiles.",
  "WHY PANTHER GARAGE": "POURQUOI PANTHER GARAGE",
  "A better garage experience starts with trust.":
    "Une meilleure expérience au garage commence par la confiance.",
  "We bring parts, rider essentials and workshop services together to make motorcycle ownership simpler. Our focus is clear communication, dependable service and the right parts for the job.":
    "Nous réunissons pièces, équipements pilote et services d'atelier pour simplifier l'usage de votre moto. Notre priorité : une communication claire, un service fiable et les bonnes pièces pour chaque travail.",
  "Clear product information and confirmed pricing":
    "Des informations produits claires et des prix confirmés",
  "Support for electric and fuel motorcycles":
    "Prise en charge des motos électriques et thermiques",
  "Service updates and customer care": "Suivi des services et accompagnement client",
  "LET'S GET YOU BACK ON THE ROAD": "REMETTONS-VOUS EN ROUTE",
  "Need a part or a repair?": "Besoin d'une pièce ou d'une réparation ?",
  "I'm interested in…": "Je suis intéressé par…",
  "Motorcycle repair": "Réparation de moto",
  "Send enquiry": "Envoyer la demande",
  "© 2026 Panther Garage Management System": "© 2026 Système de gestion Panther Garage",
  "Customer portal →": "Portail client →",
  "Staff portal →": "Portail personnel →",
  "Workshop care.": "L'entretien d'atelier.",
  "Done right.": "Bien fait.",
  "A better garage experience starts with": "Une meilleure expérience au garage commence par",
  "trust.": "la confiance.",
  "Need a part or a": "Besoin d'une pièce ou d'une",
  "repair?": "réparation ?",
  parts: "pièces",
  records: "enregistrements",
  "Workshop register": "Registre d'atelier",
  "Conflict register (": "Registre des conflits (",
  of: "sur",
  PRODUCT: "PRODUIT",
  "CATEGORY / COMPATIBILITY": "CATÉGORIE / COMPATIBILITÉ",
  "ON HAND": "EN STOCK",
  AVAILABLE: "DISPONIBLE",
  RESERVED: "RÉSERVÉ",
  "PURCHASE COST": "COÛT D'ACHAT",
  "SELLING PRICE": "PRIX DE VENTE",
  "STOCK VALUE": "VALEUR DU STOCK",
  REORDER: "RÉAPPRO.",
  "LAST UPDATE": "DERNIÈRE MISE À JOUR",
  "JOB / RECEIVED": "TRAVAIL / REÇU",
  MECHANIC: "MÉCANICIEN",
  PROBLEM: "PROBLÈME",
  NAME: "NOM",
  PHONE: "TÉLÉPHONE",
  MOTORCYCLE: "MOTO",
  EMAIL: "E-MAIL",
  INVOICE: "FACTURE",
  DATE: "DATE",
  PAYMENT: "PAIEMENT",
  PAID: "PAYÉ",
  BALANCE: "SOLDE",
  ITEM: "ARTICLE",
  PRICE: "PRIX",
  "Name, SKU, category, compatibility…": "Nom, SKU, catégorie, compatibilité…",
  "Generated if left blank": "Généré si laissé vide",
  "Leave blank for PRICE NEEDS REVIEW": "Laisser vide pour PRIX À VÉRIFIER",
  "Optional customer search words": "Mots-clés client facultatifs",
  "Optional supplier reference": "Référence fournisseur facultative",

  /* Dashboard workspaces */
  Products: "Produits",
  "Same records as the public catalogue": "Mêmes enregistrements que le catalogue public",
  "Physical units": "Unités physiques",
  "From FIFO batch balances": "D'après les soldes des lots FIFO",
  "Stock purchase value": "Valeur d'achat du stock",
  "Quantity × batch cost": "Quantité × coût du lot",
  "Need attention": "À surveiller",
  "Product & stock register": "Registre produits et stock",
  "One set of product records for customers and staff. Costs and internal stock stay private.":
    "Un seul registre de produits pour les clients et le personnel. Les coûts et le stock interne restent privés.",
  Refresh: "Actualiser",
  "New product": "Nouveau produit",
  "All categories": "Toutes les catégories",
  "All compatibility": "Toutes les compatibilités",
  "No products match these filters.": "Aucun produit ne correspond à ces filtres.",
  "PRODUCT\tCATEGORY / COMPATIBILITY\tON HAND\tAVAILABLE\tRESERVED\tPURCHASE COST\tSELLING PRICE\tSTOCK VALUE\tREORDER\tSTATUT\tSUPPLIER\tLAST UPDATE\tACTIONS":
    "PRODUIT\tCATÉGORIE / COMPATIBILITÉ\tEN STOCK\tDISPONIBLE\tRÉSERVÉ\tCOÛT D'ACHAT\tPRIX DE VENTE\tVALEUR DU STOCK\tRÉAPPRO.\tSTATUT\tFOURNISSEUR\tDERNIÈRE MISE À JOUR\tACTIONS",
  "Stock is read from FIFO batch balances. Receiving goods creates a new costed batch and a stock movement. Direct quantity editing is disabled. Reservations are not yet used, so reserved quantity currently shows 0.":
    "Le stock est lu à partir des soldes des lots FIFO. La réception de marchandises crée un nouveau lot valorisé et un mouvement de stock. La modification directe des quantités est désactivée. Les réservations ne sont pas encore utilisées, la quantité réservée affiche donc 0.",
  units: "unités",
  left: "restants",

  Orders: "Commandes",
  Suppliers: "Fournisseurs",
  "Supplier invoices": "Factures fournisseurs",
  Expenses: "Dépenses",
  "Create purchase order": "Créer une commande d'achat",
  Supplier: "Fournisseur",
  "Select supplier": "Sélectionner un fournisseur",
  "Expected delivery": "Livraison prévue",
  "Order note": "Note de commande",
  "Add products to order": "Ajouter des produits à la commande",
  "Select product": "Sélectionner un produit",
  "Add line": "Ajouter une ligne",
  "A purchase order does not add stock. Stock increases only when goods are physically received.":
    "Une commande d'achat n'ajoute pas de stock. Le stock augmente uniquement à la réception physique des marchandises.",
  "Save purchase order": "Enregistrer la commande d'achat",
  "Purchase order register": "Registre des commandes d'achat",
  "Record partial deliveries against each order line.":
    "Enregistrez les livraisons partielles pour chaque ligne de commande.",
  "No purchase orders recorded.": "Aucune commande d'achat enregistrée.",

  "PANTHER GARAGE · OPERATIONS": "PANTHER GARAGE · OPÉRATIONS",
  "Customer register": "Registre clients",
  "Keep customer contact and motorcycle details in one place.":
    "Regroupez les coordonnées des clients et les détails des motos au même endroit.",
  "Register customer": "Enregistrer un client",
  "Full name": "Nom complet",
  "Motorcycle details": "Détails de la moto",
  "Save customer": "Enregistrer le client",
  "NAME\tPHONE\tMOTORCYCLE\tEMAIL": "NOM\tTÉLÉPHONE\tMOTO\tE-MAIL",
  "No customers found.": "Aucun client trouvé.",

  "Online spare-parts orders": "Commandes de pièces en ligne",
  "Guest orders from the public catalogue; no payment is collected online in this stage.":
    "Commandes d'invités depuis le catalogue public ; aucun paiement n'est encaissé en ligne à ce stade.",
  "No online orders yet.": "Aucune commande en ligne pour le moment.",

  "BOSS ONLY · OPENING STOCK IMPORT": "RÉSERVÉ AU BOSS · IMPORT DU STOCK D'OUVERTURE",
  "Spare-parts workbook import": "Import du classeur de pièces",
  "The primary workbook creates opening stock once. The comparison workbook is used only to detect differences and is never imported as extra stock. Product names, quantities and purchase costs are kept exactly as supplied. Imported prices stay unpublished until BOSS confirms them.":
    "Le classeur principal crée le stock d'ouverture une seule fois. Le classeur de comparaison sert uniquement à détecter les différences et n'est jamais importé comme stock supplémentaire. Les noms de produits, quantités et coûts d'achat sont conservés exactement tels que fournis. Les prix importés restent non publiés jusqu'à confirmation par le BOSS.",
  Reload: "Recharger",
  "Read workbooks": "Lire les classeurs",
  "No import has been staged yet": "Aucun import n'a encore été préparé",
  "Read the two supplied workbooks to create a review draft. Staging does not change products or stock. You can inspect every row and conflict before anything is approved or applied.":
    "Lisez les deux classeurs fournis pour créer un brouillon de révision. La préparation ne modifie ni les produits ni le stock. Vous pouvez inspecter chaque ligne et conflit avant toute approbation ou application.",
  "Read spare-parts workbooks": "Lire les classeurs de pièces",

  "Supabase Auth": "Supabase Auth",
  "Role-based RLS": "RLS basé sur les rôles",

  "Business performance": "Performance de l'entreprise",
  "Reports are calculated from recorded transactions for the selected period.":
    "Les rapports sont calculés à partir des transactions enregistrées pour la période sélectionnée.",
  From: "Du",
  To: "Au",
  Generate: "Générer",

  "Smart restocking analysis": "Analyse intelligente du réapprovisionnement",
  "Demand is calculated from recorded sales and repair-part issues over the last 90 days.":
    "La demande est calculée à partir des ventes et des pièces utilisées en réparation sur les 90 derniers jours.",
  "Refresh analysis": "Actualiser l'analyse",
  "Active products analysed": "Produits actifs analysés",
  "Need restock review": "À revoir pour réapprovisionnement",
  "Usable quantity suggestions": "Suggestions de quantités utilisables",
  "Formula: reorder point = average daily demand × supplier lead time + safety stock. Suggested quantity aims to cover the supplier lead time plus the configured stock coverage after delivery. Recommendations are decision support—not automatic purchase orders.":
    "Formule : point de commande = demande journalière moyenne × délai fournisseur + stock de sécurité. La quantité suggérée vise à couvrir le délai fournisseur plus la couverture de stock configurée après livraison. Les recommandations sont une aide à la décision, pas des commandes automatiques.",
  "Product recommendations": "Recommandations de produits",
  "Review urgent items first; limited history is clearly flagged.":
    "Examinez d'abord les articles urgents ; l'historique limité est clairement signalé.",
  "No products match this search.": "Aucun produit ne correspond à cette recherche.",
  "Products with fewer than 3 demand events or fewer than 3 distinct demand days are not given an order quantity. No sales history is not treated as zero future demand. Confirm supplier lead times and unusual seasonal demand before ordering.":
    "Les produits comptant moins de 3 événements de demande ou moins de 3 jours de demande distincts ne reçoivent pas de quantité de commande. L'absence d'historique de ventes n'est pas traitée comme une demande future nulle. Confirmez les délais fournisseurs et les pics saisonniers avant de commander.",

  "PANTHER GARAGE · WORKSHOP": "PANTHER GARAGE · ATELIER",
  "Repair jobs & service tracking": "Réparations et suivi des services",
  "Register motorcycles, assign staff, issue spare parts and track every repair stage.":
    "Enregistrez les motos, affectez le personnel, sortez les pièces et suivez chaque étape de la réparation.",
  "New repair job": "Nouvelle réparation",
  "Open jobs": "Travaux ouverts",
  "In progress": "En cours",
  "Ready for collection": "Prêt à retirer",
  Collected: "Retiré",
  "JOB / RECEIVED\tCUSTOMER\tMOTORCYCLE\tPROBLEM\tMECHANIC\tTotal\tSTATUT":
    "TRAVAIL / REÇU\tCLIENT\tMOTO\tPROBLÈME\tMÉCANICIEN\tTotal\tSTATUT",
  "No repair jobs match your search.": "Aucune réparation ne correspond à votre recherche.",

  "Customer repair requests": "Demandes de réparation des clients",
  "Online requests submitted through the public customer portal.":
    "Demandes en ligne envoyées via le portail client public.",
  "No customer bookings yet.": "Aucune réservation client pour le moment.",

  "Point of sale & invoices": "Point de vente et factures",
  "Record counter sales, collect payment and deduct stock atomically.":
    "Enregistrez les ventes au comptoir, encaissez le paiement et déduisez le stock de façon atomique.",
  "New sale": "Nouvelle vente",
  "Customer (optional)": "Client (facultatif)",
  "Walk-in customer": "Client sans rendez-vous",
  Product: "Produit",
  Qty: "Qté",
  "Add products to start an invoice.": "Ajoutez des produits pour commencer une facture.",
  Subtotal: "Sous-total",
  "Discount (RWF)": "Remise (RWF)",
  "Total due": "Total à payer",
  "Payment & completion": "Paiement et clôture",
  "Payment method": "Mode de paiement",
  Cash: "Espèces",
  "Mobile Money": "Mobile Money",
  "Bank transfer": "Virement bancaire",
  Card: "Carte",
  "Credit / partial payment": "Crédit / paiement partiel",
  "Amount received (RWF)": "Montant reçu (RWF)",
  "For Cash, Mobile Money, Bank transfer and Card, payment must equal the invoice total. Credit supports a remaining balance.":
    "Pour les espèces, Mobile Money, le virement et la carte, le paiement doit être égal au total de la facture. Le crédit autorise un solde restant.",
  "Complete sale & issue invoice": "Finaliser la vente et émettre la facture",
  "Stock is deducted inside the database transaction using FIFO cost batches. If stock is insufficient, the entire sale is rejected.":
    "Le stock est déduit dans la transaction de base de données via les lots de coût FIFO. Si le stock est insuffisant, la vente entière est rejetée.",
  "Recent invoices": "Factures récentes",
  "Latest 100": "100 dernières",
  "INVOICE\tDATE\tCUSTOMER\tPAYMENT\tTotal\tPAID\tBALANCE":
    "FACTURE\tDATE\tCLIENT\tPAIEMENT\tTotal\tPAYÉ\tSOLDE",
  "No invoices have been issued yet.": "Aucune facture n'a encore été émise.",
  "Loading live records…": "Chargement des enregistrements…",

  /* Catalogue price and classification review */
  "Catalogue review": "Révision du catalogue",
  "Catalogue price & classification review": "Révision des prix et de la classification du catalogue",
  "Products in review": "Produits à réviser",
  "Set confirmed selling prices, categories and compatibility. A saved price above zero is published immediately; a blank or zero price keeps the part at PRICE NEEDS REVIEW. Purchase costs never appear publicly.":
    "Définissez les prix de vente confirmés, les catégories et la compatibilité. Un prix enregistré supérieur à zéro est publié immédiatement ; un prix vide ou nul maintient la pièce à PRIX À VÉRIFIER. Les coûts d'achat n'apparaissent jamais publiquement.",
  "Save changes": "Enregistrer les modifications",
  "Search name, SKU, category…": "Rechercher nom, SKU, catégorie…",
  "Filter by review state": "Filtrer par état de révision",
  "Needs review": "À réviser",
  "Needs price": "Prix à confirmer",
  "Needs classification": "Classification à revoir",
  "Ready to publish": "Prêt à publier",
  "Bulk classification": "Classification en masse",
  "No change": "Aucun changement",
  "Apply to selected": "Appliquer à la sélection",
  "Clear selection": "Effacer la sélection",
  CLASSIFICATION: "CLASSIFICATION",
  "PRICE STATUS": "ÉTAT DU PRIX",
  ACTIONS: "ACTIONS",
  Confirmed: "Confirmé",
  Reset: "Réinitialiser",
  "Reset this row": "Réinitialiser cette ligne",
  INACTIVE: "INACTIF",
  "Select all visible products": "Sélectionner tous les produits visibles",
  "Loading catalogue…": "Chargement du catalogue…",
  "No products match this review filter.": "Aucun produit ne correspond à ce filtre de révision.",
  "Active and inactive records": "Enregistrements actifs et inactifs",
  "Not published until BOSS confirms": "Non publié jusqu'à confirmation du BOSS",
  "Category or compatibility unconfirmed": "Catégorie ou compatibilité non confirmée",
  "Active, classified and priced": "Actif, classé et avec prix",
  "Saving a positive price publishes it to the public catalogue immediately. Blank or zero prices keep the part at PRICE NEEDS REVIEW. Categories, compatibility and prices are saved together; purchase costs and internal stock stay private.":
    "L'enregistrement d'un prix supérieur à zéro le publie immédiatement dans le catalogue public. Un prix vide ou nul maintient la pièce à PRIX À VÉRIFIER. Les catégories, la compatibilité et les prix sont enregistrés ensemble ; les coûts d'achat et le stock interne restent privés.",
  "Could not load the catalogue.": "Impossible de charger le catalogue.",
  "Could not save the catalogue changes.": "Impossible d'enregistrer les modifications du catalogue.",
  "Only BOSS can edit product prices or classification.":
    "Seul le BOSS peut modifier les prix ou la classification des produits.",
  "No catalogue changes were supplied.": "Aucune modification du catalogue n'a été fournie.",
  "Invalid request body.": "Corps de requête invalide.",
  "Category cannot be blank.": "La catégorie ne peut pas être vide.",
  "Invalid compatibility value.": "Valeur de compatibilité invalide.",
  "Enter a valid selling price.": "Saisissez un prix de vente valide.",
  "Some catalogue rows could not be saved.":
    "Certaines lignes du catalogue n'ont pas pu être enregistrées.",
  "Migration 008 has not been applied yet. Price review and compatibility fields will appear after it is installed.":
    "La migration 008 n'a pas encore été appliquée. Les champs de révision des prix et de compatibilité apparaîtront après son installation.",
  "Open orders:": "Commandes ouvertes :",
  "Guest orders from the public catalogue. Fulfilling an order creates an invoice and issues stock using FIFO; nothing is reserved before that.":
    "Commandes de visiteurs passées depuis le catalogue public. La livraison d'une commande crée une facture et sort le stock selon la méthode FIFO ; rien n'est réservé avant cela.",
  "Not enough stock": "Stock insuffisant",
  "Mark contacted": "Marquer comme contacté",
  "Confirm order": "Confirmer la commande",
  "Cancel order": "Annuler la commande",
  "Fulfil and issue stock": "Livrer et sortir le stock",
  "This order is short of stock. Add stock before fulfilling it.":
    "Cette commande manque de stock. Ajoutez du stock avant de la livrer.",
  "Creates an invoice and issues stock using FIFO. The invoice uses the current confirmed prices.":
    "Crée une facture et sort le stock selon la méthode FIFO. La facture utilise les prix confirmés actuels.",
  "Stock issued and invoice created": "Stock sorti et facture créée",
  "Cancelled. No stock issued.": "Annulée. Aucun stock sorti.",
  Invoice: "Facture",
  Paid: "Payé",
  "Balance due": "Solde dû",
  Created: "Créée",
  "Loading orders…": "Chargement des commandes…",
  "Credit (pay on collection)": "Crédit (paiement à la collecte)",
  "Order updated.": "Commande mise à jour.",
  "Order confirmed. Fulfil it to issue stock.":
    "Commande confirmée. Livrez-la pour sortir le stock.",
  "Order cancelled. No stock was issued.": "Commande annulée. Aucun stock n'a été sorti.",
  "Stock issued and invoice created.": "Stock sorti et facture créée.",
  "Could not load orders.": "Impossible de charger les commandes.",
  "Could not update order.": "Impossible de mettre à jour la commande.",
  "Choose a valid order and status.": "Choisissez une commande et un statut valides.",
  "Order not found.": "Commande introuvable.",
  "No change needed.": "Aucun changement nécessaire.",
  "Confirm the order before issuing stock and creating the invoice.":
    "Confirmez la commande avant de sortir le stock et de créer la facture.",
  "Choose a valid payment method.": "Choisissez un mode de paiement valide.",
  "This order has no items.": "Cette commande ne contient aucun article.",
  "This order is already fulfilled. Stock has been issued; use a return instead of changing it.":
    "Cette commande est déjà livrée. Le stock a été sorti ; utilisez un retour au lieu de la modifier.",
  "A cancelled order cannot be reopened. Ask the customer to submit a new order.":
    "Une commande annulée ne peut pas être rouverte. Demandez au client de soumettre une nouvelle commande.",
  "This order was changed by someone else. Refresh and try again.":
    "Cette commande a été modifiée par quelqu'un d'autre. Actualisez et réessayez.",
  "Orders can only move forward: Pending → Contacted → Confirmed.":
    "Les commandes ne peuvent qu'avancer : En attente → Contacté → Confirmé.",
};

const rw: Dictionary = {
  Home: "Ahabanza",
  "Spare parts": "Ibyuma",
  Services: "Serivisi",
  Portal: "Urubuga",
  Contact: "Twandikire",
  "About us": "Abo turi bo",
  "Staff login": "Kwinjira kw'abakozi",
  "Customer portal": "Urubuga rw'umukiriya",
  "Back to website": "Subira ku rubuga",
  "Back to parts": "Subira ku byuma",
  Search: "Shakisha",
  "Search parts…": "Shakisha ibyuma…",
  "Search products, SKU, category…": "Shakisha ibicuruzwa, SKU, icyiciro…",
  "Name, SKU, model, keyword…": "Izina, SKU, moderi, ijambo…",
  "Search spare parts": "Shakisha ibyuma",
  Filters: "Muyunguruzi",
  Filter: "Mungurura",
  Sort: "Gutondeka",
  "Sort: name": "Gutondeka: izina",
  "Sort: price low to high": "Gutondeka: igiciro gito kugeza kinini",
  "Sort: price high to low": "Gutondeka: igiciro kinini kugeza gito",
  "Sort: recently updated": "Gutondeka: byavuguruwe vuba",
  "Sort: available first": "Gutondeka: ibihari mbere",
  All: "Byose",
  "All motorcycles": "Moto zose",
  "Any availability": "Ukuboneka kwose",
  "Available now": "Birahari ubu",
  "In stock": "Bihari",
  "Out of stock": "Byashize",
  "Low stock": "Ibice bike",
  "Check availability": "Reba ko bihari",
  "Price on request": "Igiciro kubaza",
  "PRICE NEEDS REVIEW": "IGICIRO KIRAKENEYE KUGENZURWA",
  "Price needs review": "Igiciro kirakeneye kugenzurwa",
  "Confirmed price": "Igiciro cyemejwe",
  "Selling price not published": "Igiciro cyo kugurisha nticyatangajwe",
  Category: "Icyiciro",
  Compatibility: "Guhuza na moto",
  SKU: "SKU",
  "Last catalogue update:": "Ivugurura rya nyuma ry'urutonde:",
  "Last catalogue update": "Ivugurura rya nyuma ry'urutonde",
  "THE PARTS COUNTER": "IKIGO CY'IBYUMA",
  "Find what keeps you": "Shakisha ibikugumana",
  "moving.": "mu rugendo.",
  "YOUR RIDE. OUR PRIORITY.": "URUGENDO RWAWE. NI CYO TWITA KU CYO.",
  "BUILT FOR": "BYAKOREWE",
  "THE RIDE.": "URUGENDO.",
  "Quality motorcycle spare parts, rider essentials and dependable workshop service — everything your motorcycle needs, in one place.":
    "Ibyuma byiza by'amapikipiki, ibikoresho by'abamukinnyi na serivisi y'ubukorikori yizewe — ibyo moto yawe ikeneye byose, ahantu hamwe.",
  "Explore spare parts": "Reba ibyuma",
  "Book a repair": "Saba gusana",
  "Quality parts": "Ibyuma byiza",
  "Skilled service": "Serivisi y'umuhanga",
  "Rider first": "Umukinnyi mbere",
  "SPARE PARTS": "IBYUMA",
  "RIDER GEAR": "IBIKORESHOO BY'UMUKINNYI",
  "MECHANICAL REPAIRS": "GUSANA IMASHINI",
  "ELECTRIC & FUEL MOTORCYCLES": "MOTO Z'AMASHANYARAZI N'IBICANWA",
  RWANDA: "U RWANDA",
  "The supplier catalogue migration has not been applied yet. Availability and confirmed prices may be limited until the database is updated.":
    "Ihinduka ry'urutonde rw'ibicuruzwa ntirirakoreshwa. Kuboneka n'ibiciro byemejwe bishobora kugabanuka kugeza ububiko buvuguruwe.",
  "No matching products. Try another search.":
    "Nta bicuruzwa bihuye. Gerageza ubundi bushakashatsi.",
  "No matching parts. Try a different search, model or availability filter.":
    "Nta byuma bihuye. Gerageza ubundi bushakashatsi, moderi cyangwa muyunguruzi w'ukuboneka.",
  "Clear filters": "Siba muyunguruzi",
  "Genuine spare part stocked by Panther Garage.":
    "Icyuma nyakuri kibikwa muri Panther Garage.",
  "Request list": "Urutonde rw'ibisabwa",
  "Your request list": "Urutonde rwawe rw'ibisabwa",
  "Your request list is empty.": "Urutonde rwawe rw'ibisabwa ni ubusa.",
  "Submit request": "Ohereza ubusabe",
  "Submitting…": "Turaohereza…",
  "Request received": "Ubusabe bwakiriwe",
  "Request this part": "Saba iki cyuma",
  "Ordering is paused for this part": "Gutumiza iki cyuma byahagaritswe",
  "Contact the garage": "Vugana na garage",
  Reference: "Inomero:",
  Total: "Igiteranyo",
  "Your full name": "Izina ryawe ryuzuye",
  "Phone number": "Numero ya telefoni",
  "Email (optional)": "Imeyili (si ngombwa)",
  "Collection, delivery or motorcycle details (optional)":
    "Amakuru yo gufata, gutanga cyangwa moto (si ngombwa)",
  Close: "Funga",
  Remove: "Kuraho",
  Add: "Ongeraho",
  Save: "Bika",
  Cancel: "Kureka",
  Delete: "Siba",
  Edit: "Hindura",
  "Loading…": "Turategeka…",
  "No data": "Nta makuru",
  "STAFF ACCESS": "KWINJIRA KW'ABAKOZI",
  "THE GARAGE": "GARAGE",
  COMMAND: "Y'UBUYOBOZI",
  CENTER: "IKIGO",
  "CENTER.": "IKIGO.",
  "One secure workspace for stock, sales, workshop operations and business control.":
    "Ahantu hamwe hizewe ho kubika ibicuruzwa, kugurisha, imirimo yo mu kinyabiziga no kuyobora ubucuruzi.",
  "PANTHER GARAGE MANAGEMENT SYSTEM · PGMS": "SISITEMU Y'UBUYOBOZI YA PANTHER GARAGE · PGMS",
  "Welcome back.": "Murakaza neza.",
  "Sign in using your staff account.": "Injira ukoresheje konti yawe y'umukozi.",
  "Email address": "Aderesi imeyili",
  Password: "Ijambo ry'ibanga",
  "Sign in to dashboard": "Injira mu kibaho",
  "Signing in…": "Turi kwinjira…",
  "Only Boss-created staff accounts can access the management system. Public self-registration is disabled.":
    "Ni konti z'abakozi zakozwe na Boss gusa zishobora kwinjira mu sisitemu y'ubuyobozi. Kwiyandikisha ku ruhame byahagaritswe.",
  "Sign-in failed. Check your email and password, or ask the boss to activate your account.":
    "Kwinjira byanze. Reba imeyili n'ijambo ry'ibanga, cyangwa saba Boss gukora konti yawe.",
  "Your staff profile is not active. Contact the boss.":
    "Umwirondoro wawe w'umukozi ntukora. Vugana na Boss.",
  "CUSTOMER SELF-SERVICE": "SERIVISI Y'UMUKIRIYA",
  "Your garage,": "Garage yawe,",
  "within reach.": "iri hafi.",
  "Track a repair": "Kurikirana gusana",
  "Repair appointment request": "Ubusabe bw'igihe cyo gusana",
  "Submitting a request does not confirm an appointment. The garage will contact you.":
    "Kohereza ubusabe ntibyemeza igihe. Garage izakwandikira.",
  "Your full name *": "Izina ryawe ryuzuye *",
  "Phone number *": "Numero ya telefoni *",
  "Motorcycle make": "Ubwoko bwa moto",
  "Motorcycle model": "Moderi ya moto",
  "Registration number": "Numero y'iyandikisha",
  "Reported issue": "Ikibazo cyavuzwe",
  "Preferred date": "Itariki wifuza",
  "Job number": "Numero y'akazi",
  "Track repair": "Kurikirana gusana",
  WORKSPACE: "AHO UKORERA",
  "BOSS ACCOUNT": "KONTI YA BOSS",
  "EMPLOYEE ACCOUNT": "KONTI Y'UMUKOZI",
  "Access is enforced by Supabase Row Level Security and server-side checks.":
    "Uruhare rugenzurwa na Supabase Row Level Security n'isuzuma rya seriveri.",
  "Refresh data": "Vugurura amakuru",
  "Sign out": "Sohoka",
  "PANTHER GARAGE · RWANDA": "PANTHER GARAGE · U RWANDA",
  "Good work starts with a clear view.": "Imirimo myiza itangira n'icyerekezo gisobanutse.",
  "Live product and inventory records from your garage database.":
    "Amakuru y'ibicuruzwa n'ububiko ari gukora ubu ava mu bubiko bwa garage.",
  Employees: "Abakozi",
  "Import workbooks": "Injiza ibitabo",
  "Product register": "Urutonde rw'ibicuruzwa",
  Overview: "Incamake",
  Inventory: "Ububiko",
  Import: "Kwinjiza",
  Sales: "Igurisha",
  Repairs: "Gusana",
  Customers: "Abakiriya",
  Bookings: "Gufata gahunda",
  "Online Orders": "Ibyatumijwe kuri interineti",
  Purchases: "Kugura",
  Restocking: "Kuzuza ububiko",
  Reports: "Raporu",
  Settings: "Igenamiterere",
  "Products in catalogue": "Ibicuruzwa mu rutonde",
  "Physical stock units": "Ibice byo mu bubiko",
  "Low-stock alerts": "Iburira ry'ibice bike",
  "Active staff role": "Uruhare rw'umukozi ukora",
  "Live database records": "Amakuru ari mu bubiko",
  "Across recorded batches": "Mu byiciro byose byanditswe",
  "At or below minimum level": "Ku rwego ruto cyangwa munsi",
  "Verified staff profile": "Umwirondoro w'umukozi wemejwe",
  "Inventory overview": "Incamake y'ububiko",
  "Physical stock from FIFO batches": "Ububiko buva mu byiciro bya FIFO",
  "View inventory →": "Reba ububiko →",
  "No products yet. Register your first product.":
    "Nta bicuruzwa biraboneka. Andika igicuruzwa cya mbere.",
  "Attention required": "Bisaba kwitabwaho",
  "Products that need a restock review": "Ibicuruzwa bikeneye kugenzurwa mu kuzuza ububiko",
  "No low-stock products.": "Nta bicuruzwa biri mu bubiko buke.",
  "Restock alerts use actual batch stock.":
    "Iburira ryo kuzuza ububiko rikoresha ububiko nyakuri bw'ibyiciro.",
  "Employee accounts": "Konti z'abakozi",
  "Only BOSS can create or deactivate EMPLOYEE accounts.":
    "Ni BOSS gusa ushobora gukora cyangwa guhagarika konti z'ABAKOZI.",
  "Add employee": "Ongeraho umukozi",
  EMPLOYEE: "UMUKOZI",
  "ACCOUNT TYPE": "UBWOKO BWA KONTI",
  STATUS: "IMITERERE",
  CREATED: "YAKOZWE",
  ACTION: "IGIKORWA",
  Active: "Birakora",
  Inactive: "Ntibikora",
  Deactivate: "Hagarika",
  Reactivate: "Ongera ukoreshe",
  "No employee accounts found.": "Nta konti z'abakozi zabonetse.",
  "STAFF MANAGEMENT": "GUCUNGA ABAKOZI",
  "Create employee account": "Kora konti y'umukozi",
  "Employee full name": "Izina ryuzuye ry'umukozi",
  "Employee email": "Imeyili y'umukozi",
  "Temporary password (minimum 12 characters)":
    "Ijambo ry'ibanga ry'agateganyo (nibura inyuguti 12)",
  "This always creates an EMPLOYEE account. The employee should change the temporary password after first login.":
    "Ibi bihora bikora konti Y'UMUKOZI. Umukozi agomba guhindura ijambo ry'ibanga ry'agateganyo amaze kwinjira bwa mbere.",
  "Saving…": "Turabika…",
  "Create employee": "Kora umukozi",
  module: "module",
  "This module is in the implementation roadmap. Use the available workspace modules to manage your garage operations.":
    "Iyi module iri mu gahunda y'iterambere. Koresha modules zihari zicunga imirimo ya garage.",
  "Connected application layer": "Urwego rwa porogaramu rwahujwe",
  "Refresh to load latest records": "Vugurura kuzana amakuru mashya",
  "Could not refresh products.": "Ntibyashobotse kuvugurura ibicuruzwa.",
  "Could not load employees.": "Ntibyashobotse kuzana abakozi.",
  "Could not create employee.": "Ntibyashobotse gukora umukozi.",
  "Could not update employee.": "Ntibyashobotse kuvugurura umukozi.",
  "Employee account created.": "Konti y'umukozi yarakozwe.",
  "Employee reactivated.": "Umukozi yongeye gukora.",
  "Employee deactivated.": "Umukozi yahagaritswe.",
  "Light mode": "Uburyo bwerurutse",
  "Dark mode": "Uburyo bw'umwijima",
  "Toggle light and dark mode": "Hindura uburyo bwerurutse n'ubw'umwijima",
  Language: "Ururimi",

  /* Storefront copy */
  "PARTS • SERVICE • PERFORMANCE": "IBICURUZWA • SERIVISI • IMIKORERE",
  "Parts • Service • Performance": "Ibicuruzwa • Serivisi • Imikorere",
  "Browse approved parts currently listed by the garage. Prices appear only after the garage has confirmed them; unavailable items are clearly marked.":
    "Reba ibyuma byemejwe garage ihagarariye ubu. Ibiciro bigaragara gusa nyuma y'uko garage yemeje; ibitaboneka bigaragazwa neza.",
  "MORE THAN A PARTS SHOP": "KURENDA IGICURUZWA GUSA",
  "Workshop care. Done right.": "Serivisi y'atelier. Ikorwa neza.",
  "Diagnostics, engine work, brake servicing and routine maintenance.":
    "Isuzuma, imirimo y'imashini, gusana amafiriti n'ubukorikori bwa buri munsi.",
  Enquire: "Baza",
  "Electric motorcycle care": "Ubukorikori bwa moto z'amashanyarazi",
  "Practical servicing for electric and conventional motorcycles.":
    "Serivisi zifatika ku moto z'amashanyarazi n'iz'ibicanwa.",
  "Rider equipment": "Ibikoresho by'umukinnyi",
  "Helmets, protective gear and useful riding accessories.":
    "Ingofero, ibikoresho byo kwirinda n'ibindi bikoresho by'urugendo.",
  "WHY PANTHER GARAGE": "KUKI PANTHER GARAGE",
  "A better garage experience starts with trust.":
    "Uburambe bwiza muri garage butangirira ku kwizerwa.",
  "We bring parts, rider essentials and workshop services together to make motorcycle ownership simpler. Our focus is clear communication, dependable service and the right parts for the job.":
    "Tuhuza ibyuma, ibikoresho by'abamukinnyi na serivisi z'atelier kugira ngo gutunga moto byoroshye. Twita ku itumanaho risobanutse, serivisi yizewe n'ibyuma bikwiye akazi.",
  "Clear product information and confirmed pricing":
    "Amakuru asobanutse ku bicuruzwa n'ibiciro byemejwe",
  "Support for electric and fuel motorcycles":
    "Gufasha moto z'amashanyarazi n'iz'ibicanwa",
  "Service updates and customer care": "Amakuru ku serivisi no kwita ku bakiriya",
  "LET'S GET YOU BACK ON THE ROAD": "TUGARURE KU RUGENDO",
  "Need a part or a repair?": "Ukeneye igicuruzwa cyangwa gusana?",
  "I'm interested in…": "Nifuza…",
  "Motorcycle repair": "Gusana moto",
  "Send enquiry": "Ohereza ikibazo",
  "© 2026 Panther Garage Management System":
    "© 2026 Sisitemu y'ubuyobozi ya Panther Garage",
  "Customer portal →": "Urubuga rw'umukiriya →",
  "Staff portal →": "Urubuga rw'abakozi →",
  "Workshop care.": "Serivisi y'atelier.",
  "Done right.": "Ikorwa neza.",
  "A better garage experience starts with": "Uburambe bwiza muri garage butangirira ku",
  "trust.": "kwizerwa.",
  "Need a part or a": "Ukeneye igicuruzwa cyangwa",
  "repair?": "gusana?",
  parts: "ibyuma",
  records: "inyandiko",
  "Workshop register": "Urutonde rw'atelier",
  "Conflict register (": "Urutonde rw'amakimbirane (",
  of: "kuri",
  PRODUCT: "IGICURUZWA",
  "CATEGORY / COMPATIBILITY": "ICYICIRO / GUHUZA",
  "ON HAND": "BIRI MU BUBIKO",
  AVAILABLE: "BIHARI",
  RESERVED: "BYABITSIRIJWE",
  "PURCHASE COST": "IGICIRO CY'UBUGUZI",
  "SELLING PRICE": "IGICIRO CYO KUGURISHA",
  "STOCK VALUE": "AGACIRO K'UBUBIKO",
  REORDER: "KUZUZA",
  "LAST UPDATE": "IVUGURURA RYA NYUMA",
  "JOB / RECEIVED": "AKAZI / BYAKIRIWE",
  MECHANIC: "UMUKANISHI",
  PROBLEM: "IKIBAZO",
  NAME: "IZINA",
  PHONE: "TELEFONI",
  MOTORCYCLE: "MOTO",
  EMAIL: "IMEYILI",
  INVOICE: "FAGITIRE",
  DATE: "ITARIKI",
  PAYMENT: "KWISHYURA",
  PAID: "BYISHYURIWE",
  BALANCE: "BISIGAYE",
  ITEM: "IKINTU",
  PRICE: "IGICIRO",
  "Name, SKU, category, compatibility…": "Izina, SKU, icyiciro, guhuza…",
  "Generated if left blank": "Bikorwa iyo bisigaye ubusa",
  "Leave blank for PRICE NEEDS REVIEW":
    "Siga ubusa kuri IGICIRO KIRAKENEYE KUGENZURWA",
  "Optional customer search words": "Amagambo y'umukiriya si ngombwa",
  "Optional supplier reference": "Inomero y'umucuruzi si ngombwa",

  /* Dashboard workspaces */
  Products: "Ibicuruzwa",
  "Same records as the public catalogue": "Amakuru amwe n'ay'urutonde rusange",
  "Physical units": "Ibice bifatika",
  "From FIFO batch balances": "Kuva ku bisigazwa by'ibyiciro bya FIFO",
  "Stock purchase value": "Agaciro k'ububiko ku buguzi",
  "Quantity × batch cost": "Ingano × igiciro cy'icyiciro",
  "Need attention": "Bikeneye kwitabwaho",
  "Product & stock register": "Urutonde rw'ibicuruzwa n'ububiko",
  "One set of product records for customers and staff. Costs and internal stock stay private.":
    "Urutonde rumwe rw'ibicuruzwa ku bakiriya n'abakozi. Ibiciro by'ubuguzi n'ububiko bw'imbere biguma ibanga.",
  Refresh: "Vugurura",
  "New product": "Igicuruzwa gishya",
  "All categories": "Ibyiciro byose",
  "All compatibility": "Guhuza kose",
  "No products match these filters.": "Nta bicuruzwa bihuye n'iyi muyunguruzi.",
  "PRODUCT\tCATEGORY / COMPATIBILITY\tON HAND\tAVAILABLE\tRESERVED\tPURCHASE COST\tSELLING PRICE\tSTOCK VALUE\tREORDER\tSTATUT\tSUPPLIER\tLAST UPDATE\tACTIONS":
    "IGICURUZWA\tICYICIRO / GUHUZA\tBIRI MU BUBIKO\tBIHARI\tBYABITSIRIJWE\tIGICIRO CY'UBUGUZI\tIGICIRO CYO KUGURISHA\tAGACIRO K'UBUBIKO\tKUZUZA\tIMITERERE\tUMUCURUZI\tIVUGURURA RYA NYUMA\tIBIKORWA",
  "Stock is read from FIFO batch balances. Receiving goods creates a new costed batch and a stock movement. Direct quantity editing is disabled. Reservations are not yet used, so reserved quantity currently shows 0.":
    "Ububiko busomwa mu bisigazwa by'ibyiciro bya FIFO. Kwakira ibicuruzwa bishyiraho icyiciro gishya gifite igiciro n'igenda ry'ububiko. Guhindura ingano mu buryo butaziguye birahagaritswe. Kubika mu nzira ntibirakoreshwa, bityo ingano yabitswe ubu igaragaza 0.",
  units: "ibice",
  left: "bisigaye",

  Orders: "Ibyatumijwe",
  Suppliers: "Abacuruzi",
  "Supplier invoices": "Fagitire z'abacuruzi",
  Expenses: "Amafaranga yasohotse",
  "Create purchase order": "Kora itumiza ry'ubuguzi",
  Supplier: "Umucuruzi",
  "Select supplier": "Hitamo umucuruzi",
  "Expected delivery": "Itariki iteganyijwe yo gutanga",
  "Order note": "Inyandiko y'itumiza",
  "Add products to order": "Ongeraho ibicuruzwa ku itumiza",
  "Select product": "Hitamo igicuruzwa",
  "Add line": "Ongeraho umurongo",
  "A purchase order does not add stock. Stock increases only when goods are physically received.":
    "Itumiza ry'ubuguzi ntiryongera ububiko. Ububiko bwiyongera gusa iyo ibicuruzwa byakiriwe bifatika.",
  "Save purchase order": "Bika itumiza ry'ubuguzi",
  "Purchase order register": "Urutonde rw'amatuniza y'ubuguzi",
  "Record partial deliveries against each order line.":
    "Andika ibyo gutanga igice ku murongo wose w'itumiza.",
  "No purchase orders recorded.": "Nta matuniza y'ubuguzi yanditswe.",

  "PANTHER GARAGE · OPERATIONS": "PANTHER GARAGE · IMIKORERE",
  "Customer register": "Urutonde rw'abakiriya",
  "Keep customer contact and motorcycle details in one place.":
    "Bika amakuru y'abakiriya n'amakuru ya moto ahantu hamwe.",
  "Register customer": "Andika umukiriya",
  "Full name": "Izina ryuzuye",
  "Motorcycle details": "Amakuru ya moto",
  "Save customer": "Bika umukiriya",
  "NAME\tPHONE\tMOTORCYCLE\tEMAIL": "IZINA\tTELEFONI\tMOTO\tIMEYILI",
  "No customers found.": "Nta bakiriya babonetse.",

  "Online spare-parts orders": "Ibyatumijwe by'ibyuma kuri interineti",
  "Guest orders from the public catalogue; no payment is collected online in this stage.":
    "Ibyatumijwe n'abashyitsi baturuka ku rutonde rusange; nta kwishyura kuri interineti muri iki gihe.",
  "No online orders yet.": "Nta byatumijwe kuri interineti byarabonetse.",

  "BOSS ONLY · OPENING STOCK IMPORT": "BOSS GUSA · KWINJIZA UBUBIKO BWA MBERE",
  "Spare-parts workbook import": "Kwinjiza igitabo cy'ibyuma",
  "The primary workbook creates opening stock once. The comparison workbook is used only to detect differences and is never imported as extra stock. Product names, quantities and purchase costs are kept exactly as supplied. Imported prices stay unpublished until BOSS confirms them.":
    "Igitabo cy'ibanze gishyiraho ububiko bwa mbere inshuro imwe. Igitabo cyo kugereranya gikoreshwa gusa mu kubona itandukaniro kandi nticyinjizwa nk'ububiko bwinyongera. Amazina y'ibicuruzwa, ingano n'ibiciro by'ubuguzi bigumana uko byatanzwe. Ibiciro byinjijwe ntibigaragazwa kugeza BOSS abiyeze.",
  Reload: "Ongera utangize",
  "Read workbooks": "Soma ibitabo",
  "No import has been staged yet": "Nta kwinjiza kwarateguwe",
  "Read the two supplied workbooks to create a review draft. Staging does not change products or stock. You can inspect every row and conflict before anything is approved or applied.":
    "Soma ibitabo bibiri byatanzwe kugira ngo ukore umushinga wo kugenzura. Gutegura ntabwo bihindura ibicuruzwa cyangwa ububiko. Ushobora kureba umurongo wose n'amakimbirane mbere y'uko byemezwa cyangwa bikoreshwa.",
  "Read spare-parts workbooks": "Soma ibitabo by'ibyuma",

  "Supabase Auth": "Supabase Auth",
  "Role-based RLS": "RLS ishingiye ku nshingano",

  "Business performance": "Imikorere y'ubucuruzi",
  "Reports are calculated from recorded transactions for the selected period.":
    "Raporo zibarwa dukurikije ibikorwa byanditswe mu gihe cyatoranyijwe.",
  From: "Kuva",
  To: "Kugeza",
  Generate: "Kora",

  "Smart restocking analysis": "Isesengura ry'ubuhanga ryo kuzuza ububiko",
  "Demand is calculated from recorded sales and repair-part issues over the last 90 days.":
    "Ibisabwa bibarwa dukurikije ibicuruzwa byagurishijwe n'ibyuma byakoreshejwe mu gusana mu minsi 90 ishize.",
  "Refresh analysis": "Vugurura isesengura",
  "Active products analysed": "Ibicuruzwa bikora byasesenguwe",
  "Need restock review": "Bikeneye kugenzurwa mu kuzuza ububiko",
  "Usable quantity suggestions": "Ibitekerezo by'ingano ikoreshwa",
  "Formula: reorder point = average daily demand × supplier lead time + safety stock. Suggested quantity aims to cover the supplier lead time plus the configured stock coverage after delivery. Recommendations are decision support—not automatic purchase orders.":
    "Formula: ahantu ho gutumiza = ibisabwa ku munsi bihagaze × igihe umucuruzi atwara + ububiko bw'umutekano. Ingano itekerejwe igamije gutuza igihe umucuruzi atwara hamwe n'ububiko bwateganyijwe nyuma yo gutanga. Ibiteterezo ni ubufasha mu gufata umwanzuro—ntiby'amatumiza yikora.",
  "Product recommendations": "Ibitekerezo by'ibicuruzwa",
  "Review urgent items first; limited history is clearly flagged.":
    "Reba mbere ibikeneye byihutirwa; amateka make agaragazwa neza.",
  "No products match this search.": "Nta bicuruzwa bihuye n'ubu bushakashatsi.",
  "Products with fewer than 3 demand events or fewer than 3 distinct demand days are not given an order quantity. No sales history is not treated as zero future demand. Confirm supplier lead times and unusual seasonal demand before ordering.":
    "Ibicuruzwa bifite ibyabaye bitageze kuri 3 cyangwa iminsi itandukanye itageze kuri 3 ntibihabwa ingano yo gutumiza. Kubura amateka y'igurisha ntibifatwa nk'uko nta gisabwa kizabaho. Emeza igihe umucuruzi atwara n'ibisabwa bidasanzwe by'ibihe mbere yo gutumiza.",

  "PANTHER GARAGE · WORKSHOP": "PANTHER GARAGE · ATELIER",
  "Repair jobs & service tracking": "Imirimo yo gusana no gukurikirana serivisi",
  "Register motorcycles, assign staff, issue spare parts and track every repair stage.":
    "Andika moto, shyiraho abakozi, tanga ibyuma kandi ukurikirane intambwe yose yo gusana.",
  "New repair job": "Akazi gashya ko gusana",
  "Open jobs": "Imirimo ifunguye",
  "In progress": "Irakomeje",
  "Ready for collection": "Byiteguye gufatwa",
  Collected: "Byafashwe",
  "JOB / RECEIVED\tCUSTOMER\tMOTORCYCLE\tPROBLEM\tMECHANIC\tTotal\tSTATUT":
    "AKAZI / BYAKIRIWE\tUMUKIRIYA\tMOTO\tIKIBAZO\tUMUKANISHI\tIgiteranyo\tIMITERERE",
  "No repair jobs match your search.":
    "Nta mirimo yo gusana ihuye n'ubushakashatsi bwawe.",

  "Customer repair requests": "Ibisabwa byo gusana by'abakiriya",
  "Online requests submitted through the public customer portal.":
    "Ibisabwa byoherejwe kuri interineti binyuze ku rubuga rusange rw'abakiriya.",
  "No customer bookings yet.": "Nta gahunda z'abakiriya ziraboneka.",

  "Point of sale & invoices": "Ahantu ho kugurisha na fagitire",
  "Record counter sales, collect payment and deduct stock atomically.":
    "Andika ibigurishwa ku kiguzi, kusanya amafaranga kandi ugabanye ububiko icyarimwe.",
  "New sale": "Igurisha rishya",
  "Customer (optional)": "Umukiriya (si ngombwa)",
  "Walk-in customer": "Umukiriya utiyandikishije",
  Product: "Igicuruzwa",
  Qty: "Ingano",
  "Add products to start an invoice.":
    "Ongeraho ibicuruzwa kugira ngo utangire fagitire.",
  Subtotal: "Igiteranyo gito",
  "Discount (RWF)": "Ugabanywa (RWF)",
  "Total due": "Igiteranyo kigomba kwishyurwa",
  "Payment & completion": "Kwishyura no kurangiza",
  "Payment method": "Uburyo bwo kwishyura",
  Cash: "Amafaranga",
  "Mobile Money": "Mobile Money",
  "Bank transfer": "Kohereza kuri banki",
  Card: "Ikarita",
  "Credit / partial payment": "Inguzanyo / kwishyura igice",
  "Amount received (RWF)": "Amafaranga yakiriwe (RWF)",
  "For Cash, Mobile Money, Bank transfer and Card, payment must equal the invoice total. Credit supports a remaining balance.":
    "Ku mafaranga, Mobile Money, kohereza kuri banki n'ikarita, ubwishyu bugomba kungana n'igiteranyo cya fagitire. Inguzanyo yemera asigaye.",
  "Complete sale & issue invoice": "Rangiza igurisha kandi utange fagitire",
  "Stock is deducted inside the database transaction using FIFO cost batches. If stock is insufficient, the entire sale is rejected.":
    "Ububiko bugabanywa mu bikorwa bya database hakoreshejwe ibyiciro by'igiciro bya FIFO. Niba ububiko butahagije, igurisha ryose ryanzwe.",
  "Recent invoices": "Fagitire ziheruka",
  "Latest 100": "100 ziheruka",
  "INVOICE\tDATE\tCUSTOMER\tPAYMENT\tTotal\tPAID\tBALANCE":
    "FAGITIRE\tITARIKI\tUMUKIRIYA\tKWISHYURA\tIgiteranyo\tBYISHYURIWE\tBISIGAYE",
  "No invoices have been issued yet.": "Nta fagitire zaratanzwe.",
  "Loading live records…": "Turazana amakuru…",

  /* Catalogue price and classification review */
  "Catalogue review": "Kugenzura urutonde",
  "Catalogue price & classification review": "Kugenzura ibiciro n'ibyiciro by'urutonde",
  "Products in review": "Ibicuruzwa bigenzurwa",
  "Set confirmed selling prices, categories and compatibility. A saved price above zero is published immediately; a blank or zero price keeps the part at PRICE NEEDS REVIEW. Purchase costs never appear publicly.":
    "Shyiraho ibiciro byemejwe, ibyiciro no guhuza na moto. Igiciro cyabitswe kirenze zero gitangazwa ako kanya; igiciro kibaye ubusa cyangwa zero gituma igice kiguma kuri IGICIRO KIRAKENEYE KUGENZURWA. Ibiciro by'ubuguzi ntibigaragara ku ruhame.",
  "Save changes": "Bika impinduka",
  "Search name, SKU, category…": "Shakisha izina, SKU, icyiciro…",
  "Filter by review state": "Mungurura ku miterere yo kugenzura",
  "Needs review": "Bikeneye kugenzurwa",
  "Needs price": "Bikeneye igiciro",
  "Needs classification": "Bikeneye ibyiciro",
  "Ready to publish": "Byiteguye gutangazwa",
  "Bulk classification": "Ibyiciro byinshi",
  "No change": "Nta mpinduka",
  "Apply to selected": "Koresha ku byatoranyijwe",
  "Clear selection": "Siba ibyatoranyijwe",
  CLASSIFICATION: "IBYICIRO",
  "PRICE STATUS": "IMITERERE Y'IGICIRO",
  ACTIONS: "IBIKORWA",
  Confirmed: "Byemejwe",
  Reset: "Subiza",
  "Reset this row": "Subiza uyu murongo",
  INACTIVE: "Ntikora",
  "Select all visible products": "Hitamo ibicuruzwa byose bigaragara",
  "Loading catalogue…": "Turazana urutonde…",
  "No products match this review filter.": "Nta bicuruzwa bihuye n'uyu muyunguruzi wo kugenzura.",
  "Active and inactive records": "Inyandiko zikora n'izitakora",
  "Not published until BOSS confirms": "Ntibyatangazwa kugeza BOSS abyemeje",
  "Category or compatibility unconfirmed": "Icyiciro cyangwa guhuza ntibyemejwe",
  "Active, classified and priced": "Bikora, byashyizwe mu byiciro kandi bifite igiciro",
  "Saving a positive price publishes it to the public catalogue immediately. Blank or zero prices keep the part at PRICE NEEDS REVIEW. Categories, compatibility and prices are saved together; purchase costs and internal stock stay private.":
    "Kubika igiciro kirenze zero bitangaza igice ku rutonde rusange ako kanya. Ibiciro bibaye ubusa cyangwa zero bituma igice kiguma kuri IGICIRO KIRAKENEYE KUGENZURWA. Ibyiciro, guhuza n'ibiciro bibikwa hamwe; ibiciro by'ubuguzi n'ububiko bw'imbere biguma ibanga.",
  "Could not load the catalogue.": "Ntibyashobotse kuzana urutonde.",
  "Could not save the catalogue changes.": "Ntibyashobotse kubika impinduka z'urutonde.",
  "Only BOSS can edit product prices or classification.":
    "Ni BOSS gusa ushobora guhindura ibiciro cyangwa ibyiciro by'ibicuruzwa.",
  "No catalogue changes were supplied.": "Nta mpinduka z'urutonde zatanzwe.",
  "Invalid request body.": "Ikisabwa nticyemewe.",
  "Category cannot be blank.": "Icyiciro ntigishobora kuba ubusa.",
  "Invalid compatibility value.": "Agaciro ko guhuza ntikemewe.",
  "Enter a valid selling price.": "Andika igiciro cyo kugurisha gikwiye.",
  "Some catalogue rows could not be saved.":
    "Imirongo imwe y'urutonde ntibyashobotse kubikwa.",
  "Migration 008 has not been applied yet. Price review and compatibility fields will appear after it is installed.":
    "Ihinduka rya 008 ntirirakoreshwa. Ibice byo kugenzura ibiciro no guhuza bizagaragara nyuma yo kwishyirwa mu bikorwa.",
  "Open orders:": "Ibyatumijwe bifunguye :",
  "Guest orders from the public catalogue. Fulfilling an order creates an invoice and issues stock using FIFO; nothing is reserved before that.":
    "Ibyo abakiriya baturuka ku rutonde rusange batumiza. Gutanga itumiza bikora fagitire kandi bigasohora ububiko hakoreshejwe FIFO; nta gice kibikwa mbere y'ibyo.",
  "Not enough stock": "Ububiko ntibuhagije",
  "Mark contacted": "Menyekanisha ko yahuye",
  "Confirm order": "Emeza itumiza",
  "Cancel order": "Hagarika itumiza",
  "Fulfil and issue stock": "Tanga itumiza kandi usohore ububiko",
  "This order is short of stock. Add stock before fulfilling it.":
    "Iri tumiza rifite ububiko buke. Ongeraho ububiko mbere yo kuritanga.",
  "Creates an invoice and issues stock using FIFO. The invoice uses the current confirmed prices.":
    "Bikora fagitire kandi bigasohora ububiko hakoreshejwe FIFO. Fagitire ikoresha ibiciro byemejwe biriho.",
  "Stock issued and invoice created": "Ububiko bwasohowe kandi fagitire yarakozwe",
  "Cancelled. No stock issued.": "Byahagaritswe. Nta bubiko bwasohowe.",
  Invoice: "Fagitire",
  Paid: "Byishyuriwe",
  "Balance due": "Asigaye kwishyurwa",
  Created: "Byakozwe",
  "Loading orders…": "Biracyazwa ibyatumijwe…",
  "Credit (pay on collection)": "Inguzanyo (wishyura igihe utoraguye)",
  "Order updated.": "Itumiza ryavuguruwe.",
  "Order confirmed. Fulfil it to issue stock.":
    "Itumiza ryemejwe. Ritange kugira ngo ububiko busohoke.",
  "Order cancelled. No stock was issued.": "Itumiza ryahagaritswe. Nta bubiko bwasohowe.",
  "Stock issued and invoice created.": "Ububiko bwasohowe kandi fagitire yarakozwe.",
  "Could not load orders.": "Ntibyashobotse kuzana ibyatumijwe.",
  "Could not update order.": "Ntibyashobotse kuvugurura itumiza.",
  "Choose a valid order and status.": "Hitamo itumiza n'uburyo bukwiye.",
  "Order not found.": "Itumiza ntabonetse.",
  "No change needed.": "Nta mpinduka ikenewe.",
  "Confirm the order before issuing stock and creating the invoice.":
    "Emeza itumiza mbere yo gusohora ububiko no gukora fagitire.",
  "Choose a valid payment method.": "Hitamo uburyo bwo kwishyura bukwiye.",
  "This order has no items.": "Iri tumiza nta bicuruzwa birimo.",
  "This order is already fulfilled. Stock has been issued; use a return instead of changing it.":
    "Iri tumiza ryamaze gutangwa. Ububiko bwasohowe; koresha ugaruruzwa aho kurihindura.",
  "A cancelled order cannot be reopened. Ask the customer to submit a new order.":
    "Itumiza ryahagaritswe ntirishobora kongera gufungurwa. Saba umukiriya kohereza itumiza rishya.",
  "This order was changed by someone else. Refresh and try again.":
    "Iri tumiza ryahinduwe n'undi muntu. Vugurura maze ugerageze.",
  "Orders can only move forward: Pending → Contacted → Confirmed.":
    "Ibyatumijwe bigenda imbere gusa: Bitegereje → Byahuye → Byemejwe.",
};

const dictionaries: Record<Exclude<Locale, "en">, Dictionary> = { fr, rw };

const lowerCaseDictionaries: Record<Exclude<Locale, "en">, Dictionary> = {
  fr: Object.fromEntries(
    Object.entries(fr)
      .filter(([key]) => key !== key.toUpperCase())
      .map(([key, value]) => [key.toLowerCase(), value]),
  ),
  rw: Object.fromEntries(
    Object.entries(rw)
      .filter(([key]) => key !== key.toUpperCase())
      .map(([key, value]) => [key.toLowerCase(), value]),
  ),
};

const patterns: Record<
  Exclude<Locale, "en">,
  Array<{ re: RegExp; replace: string }>
> = {
  fr: [
    { re: /^(\d+) units$/i, replace: "$1 unités" },
    { re: /^(\d+) left$/i, replace: "$1 restants" },
    { re: /^(\d+) of (\d+) parts$/i, replace: "$1 sur $2 pièces" },
    { re: /^(\d+) of (\d+) records$/i, replace: "$1 sur $2 enregistrements" },
    { re: /^(\d+) of$/i, replace: "$1 sur" },
    { re: /^(\d+) products?$/i, replace: "$1 produits" },
    { re: /^(\d+) stock · (\d+) prices$/i, replace: "$1 en stock · $2 prix" },
    { re: /^Workshop register \((\d+)\)$/i, replace: "Registre d'atelier ($1)" },
    { re: /^Customers \((\d+)\)$/i, replace: "Clients ($1)" },
    { re: /^Total: (.+)$/i, replace: "Total : $1" },
    { re: /(\d+) in stock/i, replace: "$1 en stock" },
    { re: /^Per (.+) · VAT treatment confirmed at the counter$/i, replace: "Par $1 · TVA confirmée au comptoir" },
    { re: /^Reference: (.+)$/i, replace: "Référence : $1" },
    { re: /^Save changes \((\d+)\)$/i, replace: "Enregistrer les modifications ($1)" },
    { re: /^(\d+) selected$/i, replace: "$1 sélectionnés" },
    { re: /^(\d+) unsaved change\(s\)$/i, replace: "$1 modification(s) non enregistrée(s)" },
    {
      re: /^(\d+) selected row\(s\) updated in this draft\. Save changes to apply them\.$/i,
      replace:
        "$1 ligne(s) sélectionnée(s) mise(s) à jour dans ce brouillon. Enregistrez les modifications pour les appliquer.",
    },
    {
      re: /^(\d+) catalogue record\(s\) saved\.$/i,
      replace: "$1 enregistrement(s) du catalogue enregistré(s).",
    },
    {
      re: /^(\d+) catalogue row\(s\) could not be saved\.(.*)$/i,
      replace: "$1 ligne(s) du catalogue n'ont pas pu être enregistrées.$2",
    },
  ],
  rw: [
    { re: /^(\d+) units$/i, replace: "$1 ibice" },
    { re: /^(\d+) left$/i, replace: "$1 bisigaye" },
    { re: /^(\d+) of (\d+) parts$/i, replace: "$1 kuri $2 ibyuma" },
    { re: /^(\d+) of (\d+) records$/i, replace: "$1 kuri $2 inyandiko" },
    { re: /^(\d+) of$/i, replace: "$1 kuri" },
    { re: /^(\d+) products?$/i, replace: "$1 ibicuruzwa" },
    { re: /^(\d+) stock · (\d+) prices$/i, replace: "$1 mu bubiko · $2 ibiciro" },
    { re: /^Workshop register \((\d+)\)$/i, replace: "Urutonde rw'atelier ($1)" },
    { re: /^Customers \((\d+)\)$/i, replace: "Abakiriya ($1)" },
    { re: /^Total: (.+)$/i, replace: "Igiteranyo : $1" },
    { re: /(\d+) in stock/i, replace: "$1 mu bubiko" },
    { re: /^Per (.+) · VAT treatment confirmed at the counter$/i, replace: "Kuri $1 · TVA yemejwe ku kiguzi" },
    { re: /^Reference: (.+)$/i, replace: "Inomero: $1" },
    { re: /^Save changes \((\d+)\)$/i, replace: "Bika impinduka ($1)" },
    { re: /^(\d+) selected$/i, replace: "$1 byatoranyijwe" },
    { re: /^(\d+) unsaved change\(s\)$/i, replace: "$1 impinduka zitabikijwe" },
    {
      re: /^(\d+) selected row\(s\) updated in this draft\. Save changes to apply them\.$/i,
      replace:
        "$1 umurongo watoranyijwe wavuguruwe muri uyu mushinga. Bika impinduka kuzikoresha.",
    },
    {
      re: /^(\d+) catalogue record\(s\) saved\.$/i,
      replace: "$1 inyandiko z'urutonde zabitswe.",
    },
    {
      re: /^(\d+) catalogue row\(s\) could not be saved\.(.*)$/i,
      replace: "$1 imirongo y'urutonde ntibyashobotse kubikwa.$2",
    },
  ],
};

function translatePhrase(phrase: string, locale: Exclude<Locale, "en">): string {
  const direct =
    dictionaries[locale][phrase] ?? lowerCaseDictionaries[locale][phrase.toLowerCase()];
  if (direct) return direct;

  for (const { re, replace } of patterns[locale]) {
    if (re.test(phrase)) return phrase.replace(re, replace);
  }

  // Long blocks (for example multi-line marketing copy) are translated line by
  // line, but only when at least one line is known to the dictionary.
  if (phrase.includes("\n")) {
    let changed = false;
    const lines = phrase.split("\n").map((line) => {
      if (!line.trim()) return line;
      const translated = translatePhrase(line.trim(), locale);
      if (translated !== line.trim()) {
        changed = true;
        return line.replace(line.trim(), translated);
      }
      return line;
    });
    if (changed) return lines.join("\n");
  }

  return phrase;
}

export function translate(source: string, locale: Locale): string {
  if (locale === "en" || !source) return source;

  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const end = trailing ? source.length - trailing.length : source.length;
  const core = source.slice(leading.length, end);
  if (!core) return source;

  return `${leading}${translatePhrase(core, locale)}${trailing}`;
}

export function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "rw" || value === "fr";
}
