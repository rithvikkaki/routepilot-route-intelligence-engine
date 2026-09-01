"""Pan-India geography used to generate realistic demo coordinates, depots, and orders.

Primary hub is centered at Guntur/Vijayawada (AP Central) with 10 regional depots
spanning India's major logistics hubs. Customer names, streets, and zones reflect
authentic diversity across South, North, West, and East India.
"""
from __future__ import annotations

import random

# Primary central logistics hub
PRIMARY_DEPOT = {
    "name": "RoutePilot Hub — Guntur/AP Central",
    "address": "NH16 Logistics Corridor, Guntur-Vijayawada Highway, Andhra Pradesh 522001",
    "latitude": 16.309485,
    "longitude": 80.425991,
}

# Alias for backward compatibility
DEPOT = PRIMARY_DEPOT

# 10 Regional depots across India
REGIONAL_DEPOTS = [
    {
        "name": "RoutePilot Hub — Vijayawada / AP",
        "address": "Autonagar Logistics Park, Vijayawada, Andhra Pradesh 520007",
        "latitude": 16.5062,
        "longitude": 80.6480,
    },
    {
        "name": "RoutePilot Hub — Hyderabad / Telangana",
        "address": "Gachibowli Financial District Hub, Hyderabad, Telangana 500032",
        "latitude": 17.3850,
        "longitude": 78.4867,
    },
    {
        "name": "RoutePilot Hub — Bengaluru / Karnataka",
        "address": "Peenya Industrial Area Stage 2, Bengaluru, Karnataka 560058",
        "latitude": 12.9716,
        "longitude": 77.5946,
    },
    {
        "name": "RoutePilot Hub — Chennai / Tamil Nadu",
        "address": "Guindy Industrial Estate, Chennai, Tamil Nadu 600032",
        "latitude": 13.0827,
        "longitude": 80.2707,
    },
    {
        "name": "RoutePilot Hub — Mumbai / Maharashtra",
        "address": "Bhiwandi Warehousing Corridor, Mumbai MMR, Maharashtra 421302",
        "latitude": 19.0760,
        "longitude": 72.8777,
    },
    {
        "name": "RoutePilot Hub — Pune / Maharashtra",
        "address": "Hinjawadi Phase 2 Logistics Yard, Pune, Maharashtra 411057",
        "latitude": 18.5204,
        "longitude": 73.8567,
    },
    {
        "name": "RoutePilot Hub — Delhi NCR",
        "address": "Okhla Industrial Area Phase II, New Delhi, Delhi 110020",
        "latitude": 28.5478,
        "longitude": 77.2733,
    },
    {
        "name": "RoutePilot Hub — Kolkata / West Bengal",
        "address": "Taratala Logistics Yard, Kolkata, West Bengal 700088",
        "latitude": 22.5726,
        "longitude": 88.3639,
    },
    {
        "name": "RoutePilot Hub — Ahmedabad / Gujarat",
        "address": "Sanand Industrial Park, Ahmedabad, Gujarat 382110",
        "latitude": 23.0225,
        "longitude": 72.5714,
    },
    {
        "name": "RoutePilot Hub — Kochi / Kerala",
        "address": "Willingdon Island Freight Terminal, Kochi, Kerala 682003",
        "latitude": 9.9312,
        "longitude": 76.2673,
    },
]

ALL_DEPOTS = [PRIMARY_DEPOT] + REGIONAL_DEPOTS

# City clusters around primary AP hub and regional metros
# (name, center_lat, center_lon, spread_degrees, region)
PRIMARY_AP_ZONES = [
    ("Guntur Brodipet", 16.3067, 80.4365, 0.035, "AP"),
    ("Guntur Arundelpet", 16.3008, 80.4428, 0.030, "AP"),
    ("Guntur Pattabhipuram", 16.3142, 80.4180, 0.035, "AP"),
    ("Mangalagiri IT Park", 16.4312, 80.5562, 0.035, "AP"),
    ("Amaravati Capital Zone", 16.5417, 80.5158, 0.045, "AP"),
    ("Tenali Town Corridor", 16.2430, 80.6400, 0.040, "AP"),
    ("Vijayawada Benz Circle", 16.4975, 80.6556, 0.035, "AP"),
    ("Vijayawada Autonagar", 16.5062, 80.6800, 0.040, "AP"),
    ("Vijayawada One Town", 16.5186, 80.6190, 0.035, "AP"),
    ("Gannavaram Airport Road", 16.5350, 80.7950, 0.045, "AP"),
    ("Tadepalli Highway", 16.4800, 80.6000, 0.030, "AP"),
]

REGIONAL_ZONES = [
    ("Hyderabad Hitec City", 17.4435, 78.3772, 0.045, "Telangana"),
    ("Hyderabad Gachibowli", 17.4401, 78.3489, 0.045, "Telangana"),
    ("Hyderabad Banjara Hills", 17.4156, 78.4350, 0.040, "Telangana"),
    ("Hyderabad Secunderabad", 17.4399, 78.4983, 0.045, "Telangana"),
    ("Bengaluru Koramangala", 12.9352, 77.6245, 0.040, "Karnataka"),
    ("Bengaluru Whitefield", 12.9698, 77.7500, 0.050, "Karnataka"),
    ("Bengaluru Indiranagar", 12.9784, 77.6408, 0.035, "Karnataka"),
    ("Bengaluru Electronic City", 12.8452, 77.6602, 0.045, "Karnataka"),
    ("Chennai Anna Nagar", 13.0850, 80.2100, 0.040, "Tamil Nadu"),
    ("Chennai T. Nagar", 13.0418, 80.2341, 0.035, "Tamil Nadu"),
    ("Chennai OMR IT Corridor", 12.9165, 80.2285, 0.055, "Tamil Nadu"),
    ("Mumbai Bandra West", 19.0596, 72.8295, 0.040, "Maharashtra"),
    ("Mumbai Andheri East", 19.1136, 72.8697, 0.045, "Maharashtra"),
    ("Mumbai Navi Mumbai Vashi", 19.0771, 72.9986, 0.050, "Maharashtra"),
    ("Pune Hinjawadi", 18.5913, 73.7389, 0.045, "Maharashtra"),
    ("Pune Kothrud", 18.5074, 73.8077, 0.035, "Maharashtra"),
    ("Pune Viman Nagar", 18.5679, 73.9143, 0.040, "Maharashtra"),
    ("Delhi Connaught Place", 28.6330, 77.2190, 0.035, "Delhi"),
    ("Delhi South Extension", 28.5700, 77.2200, 0.035, "Delhi"),
    ("Delhi Gurugram Cyber City", 28.4950, 77.0890, 0.045, "Haryana"),
    ("Delhi Noida Sector 62", 28.6270, 77.3650, 0.045, "UP"),
    ("Kolkata Salt Lake Sector V", 22.5800, 88.4350, 0.040, "West Bengal"),
    ("Kolkata Park Street", 22.5510, 88.3530, 0.035, "West Bengal"),
    ("Kolkata New Town", 22.5958, 88.4795, 0.045, "West Bengal"),
    ("Ahmedabad SG Highway", 23.0450, 72.5180, 0.045, "Gujarat"),
    ("Ahmedabad Navrangpura", 23.0370, 72.5530, 0.035, "Gujarat"),
    ("Jaipur C-Scheme", 26.9100, 75.8000, 0.040, "Rajasthan"),
    ("Lucknow Hazratganj", 26.8500, 80.9400, 0.040, "Uttar Pradesh"),
    ("Kochi Marine Drive", 9.9800, 76.2750, 0.035, "Kerala"),
    ("Kochi Kakkanad InfoPark", 10.0100, 76.3600, 0.045, "Kerala"),
    ("Bhubaneswar Saheed Nagar", 20.2900, 85.8450, 0.040, "Odisha"),
    ("Visakhapatnam MVP Colony", 17.7400, 83.3300, 0.040, "AP"),
]

PAN_INDIA_ZONES = PRIMARY_AP_ZONES + REGIONAL_ZONES

# Diverse Indian streets and landmarks
STREETS = [
    # South / AP / Telangana / Karnataka / Tamil Nadu / Kerala
    "Brodipet 4th Line", "Arundelpet Main Road", "Pattabhipuram 2nd Cross",
    "MG Road (Bandar Road)", "Besant Road", "Eluru Road", "Autonagar Main Rd",
    "Hitec City Cyber Towers Rd", "Madhapur Road No 36", "Jubilee Hills Rd 10",
    "Gachibowli Outer Ring Rd", "Koramangala 4th Block", "Indiranagar 100ft Road",
    "Whitefield Main Rd", "Electronic City Phase 1", "Anna Salai",
    "T. Nagar Ranganathan Street", "OMR IT Highway", "MG Road Ernakulam",
    "Kakkanad InfoPark Express Way", "MVP Double Road", "Janpath Saheed Nagar",
    # West / North / East
    "Linking Road Bandra", "Marine Drive", "SV Road Andheri", "Vashi Sector 17",
    "FC Road Shivajinagar", "JM Road Deccan", "Hinjawadi Phase 1 Circle",
    "Connaught Place Outer Circle", "Ring Road Lajpat Nagar", "Golf Course Road DLF",
    "Sector 18 Market", "Park Street", "Salt Lake Sector V Central Ave",
    "Action Area 1 New Town", "SG Highway Bodakdev", "Ashram Road",
    "MI Road", "Hazratganj Main St", "Gomti Nagar Vibhuti Khand",
]

FIRST_NAMES = [
    # South India (Telugu, Kannada, Tamil, Malayalam)
    "Venkata", "Sai", "Lakshmi", "Rajesh", "Suresh", "Anand", "Haritha",
    "Kavitha", "Pradeep", "Divya", "Sneha", "Akhil", "Karthik", "Sravan",
    "Ramana", "Srinivas", "Keerthi", "Anusha", "Varun", "Teja", "Raghu",
    "Gautham", "Sandhya", "Swathi", "Manoj", "Kiran", "Madhav", "Bhavana",
    # North & Central India
    "Aarav", "Kabir", "Rohan", "Ananya", "Vikram", "Neha", "Arjun", "Priya",
    "Sameer", "Diya", "Karan", "Tara", "Siddharth", "Amit", "Ritu", "Meera",
    "Ishaan", "Pooja", "Rahul", "Manisha", "Aditya", "Shweta", "Ayush", "Tanvi",
    # West & East India
    "Kunal", "Preeti", "Sourav", "Debanjan", "Anirban", "Subhash", "Payal",
    "Chinmay", "Tanmay", "Sagar", "Riddhi", "Sonal", "Dipankar", "Poulomi",
]

LAST_NAMES = [
    # Andhra Pradesh & Telangana
    "Reddy", "Chowdary", "Rao", "Naidu", "Varma", "Goud", "Raju", "Babu",
    "Prasad", "Kamma", "Kolisetty", "Garlapati", "Yalamanchili", "Konidela",
    # Karnataka, Tamil Nadu, Kerala
    "Iyer", "Iyengar", "Menon", "Pillai", "Nair", "Hegde", "Gowda", "Murthy",
    "Bhat", "Kurup", "Shetty", "Balakrishnan", "Swaminathan",
    # North, West, East
    "Sharma", "Verma", "Kapoor", "Singh", "Gupta", "Malhotra", "Chopra",
    "Mishra", "Pandey", "Agarwal", "Bose", "Das", "Chatterjee", "Banerjee",
    "Mukherjee", "Sen", "Patil", "Deshmukh", "Kulkarni", "Shinde", "Joshi",
    "Mehta", "Shah", "Patel", "Trivedi", "Mahapatra", "Panda", "Mohanty",
]


def random_customer(rng: random.Random) -> str:
    """Generate a realistic, diverse Indian customer name."""
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def random_address(rng: random.Random, zone_name: str | None = None) -> tuple[str, str]:
    """Generate a realistic Indian street address and associated locality zone."""
    if zone_name is None:
        zone = rng.choice(PAN_INDIA_ZONES)
        zname = zone[0]
    else:
        zname = zone_name
    street = rng.choice(STREETS)
    plot = rng.randint(1, 350)
    flat = f"Flat {rng.randint(101, 804)}, " if rng.random() < 0.4 else ""
    return f"{flat}D.No. {plot}, {street}, {zname}", zname


def random_point(rng: random.Random, primary_focus: bool = False) -> tuple[float, float, str]:
    """Generate a jittered geo-coordinate tuple (latitude, longitude, zone_name).

    If primary_focus is True, coordinates are generated around the primary AP hub.
    """
    zones = PRIMARY_AP_ZONES if primary_focus else PAN_INDIA_ZONES
    name, lat, lon, spread, _ = rng.choice(zones)
    return (
        round(lat + rng.uniform(-spread, spread), 6),
        round(lon + rng.uniform(-spread, spread), 6),
        name,
    )


def random_primary_point(rng: random.Random) -> tuple[float, float, str]:
    """Generate coordinates strictly within the primary AP hub service territory."""
    return random_point(rng, primary_focus=True)


def random_regional_point(rng: random.Random, depot_index: int | None = None) -> tuple[float, float, str]:
    """Generate coordinates clustered around a specific regional depot or random regional zone."""
    if depot_index is not None and 0 <= depot_index < len(REGIONAL_DEPOTS):
        d = REGIONAL_DEPOTS[depot_index]
        spread = 0.05
        return (
            round(d["latitude"] + rng.uniform(-spread, spread), 6),
            round(d["longitude"] + rng.uniform(-spread, spread), 6),
            d["name"],
        )
    name, lat, lon, spread, _ = rng.choice(REGIONAL_ZONES)
    return (
        round(lat + rng.uniform(-spread, spread), 6),
        round(lon + rng.uniform(-spread, spread), 6),
        name,
    )

