# WANDR — Vacay Chatbot

## Product Concept, Architecture & System Design

> **WANDR is an AI-powered conversational travel assistant that helps users plan trips, discover places, receive personalized recommendations, and get real-time travel assistance through natural conversation.**

---

# 1. Product Vision

Travel planning is fragmented across search engines, blogs, maps, booking platforms, weather applications, and travel forums.

Travellers are forced to answer questions such as:

* Where should I go?
* What should I do today?
* Where should I eat?
* What can I do nearby?
* Will the weather affect my plans?
* How do I get somewhere?
* What should I do if something changes during the trip?

WANDR brings these capabilities into a single intelligent conversational travel assistant.

The Vacay Chatbot is designed to provide:

* Travel questions
* Recommendations
* Conversational trip planning
* Real-time travel assistance
* Personalized suggestions

The chatbot handles simple conversations and questions without triggering a complete multi-agent orchestration system.

---

# 2. Core Product Philosophy

WANDR should not behave like a generic chatbot.

It should behave like:

> **A knowledgeable travel companion who understands the traveller, understands the destination, and understands the context of the moment.**

The chatbot should help users answer:

> **"What should I do next?"**

It should understand:

* Where the user is
* Where the user is going
* What the user likes
* Who the user is travelling with
* What the user can afford
* What the weather is doing
* What time it is
* What the user has already done during the trip

The goal is not to provide generic travel information.

The goal is to provide:

> **The right recommendation for the right traveller at the right moment.**

---

# 3. Product Architecture Overview

WANDR consists of a lightweight conversational travel assistant supported by personalization, destination knowledge, and live travel APIs.

```text
                         ┌─────────────────────────┐
                         │       WANDR PLATFORM    │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │    VACAY CHATBOT        │
                         │                         │
                         │ Conversational Q&A      │
                         │ Recommendations         │
                         │ Trip Planning Assistance│
                         │ Live Travel Help        │
                         │ Personalized Suggestions│
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │   TRAVEL INTELLIGENCE   │
                         │         LAYER           │
                         └────────────┬────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
   ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
   │ User Memory  │           │ Destination  │           │ Live Context │
   │ & Preferences│           │ Knowledge    │           │ & APIs       │
   │              │           │ Base         │           │              │
   └──────────────┘           └──────────────┘           └──────────────┘
```

---

# 4. Product Module — Vacay Chatbot

## Purpose

The Vacay Chatbot is the conversational interface for everyday travel assistance.

It should be:

* Fast
* Natural
* Context-aware
* Personalized
* Easy to use

The system should not run the complete travel orchestration pipeline for every question.

Instead, it should determine whether the user's query can be answered through:

* Direct LLM reasoning
* User preference memory
* Retrieval from destination knowledge
* Live API data
* Simple tool calls

This allows the chatbot to remain fast and cost-efficient.

---

# 4.1 Conversational Trip Planning

Users can plan trips naturally through conversation.

### Example

```text
User:
I am going to Kyoto for 3 days with my parents.

WANDR:
Great! Since you're travelling with your parents, I would suggest
a relaxed itinerary with fewer long walks and more cultural experiences.

Would you prefer:
1. Traditional Kyoto
2. Food and culture
3. Nature and scenic places
4. A balanced itinerary?
```

The system should progressively understand:

* Destination
* Dates
* Trip duration
* Travellers
* Interests
* Budget
* Mobility requirements
* Preferred travel pace
* Accommodation location
* Dietary preferences
* Previous preferences

---

# 4.2 Destination Recommendations

Users can ask:

```text
What are the best places to visit in Kyoto?
```

The system should personalize the answer using:

* User preferences
* Trip duration
* Current location
* Opening hours
* Weather
* Crowd levels where available
* Budget
* Travel companions

The answer should not be a generic list.

Instead:

```text
Since you have two days and are travelling with your parents,
I would prioritize:

Day 1:
- Fushimi Inari early morning
- Kiyomizu-dera
- Gion evening walk

Day 2:
- Arashiyama
- Bamboo Grove
- Tenryu-ji
- Riverside dinner
```

---

# 4.3 Restaurant Recommendations

The chatbot should recommend restaurants based on:

* Cuisine
* Price range
* Ratings
* Distance
* Opening hours
* Dietary restrictions
* Group size
* Ambience
* User preferences

### Example

```text
Find romantic Italian restaurants near me
```

The system may use:

```text
User Query
     │
     ▼
Intent Extraction
     │
     ├── Cuisine: Italian
     ├── Context: Romantic
     ├── Location: Current location
     ├── Budget: Unknown
     │
     ▼
Places API
     │
     ▼
Restaurant Ranking
     │
     ▼
Personalized Response
```

---

# 4.4 Nearby Attractions & Hidden Gems

The chatbot should answer:

```text
What is interesting near me?
```

Possible recommendation categories:

* Tourist attractions
* Local neighbourhoods
* Hidden gems
* Cafés
* Museums
* Parks
* Viewpoints
* Cultural experiences
* Local markets
* Events

Recommendations should consider:

```text
Distance
+
Opening Hours
+
Weather
+
User Preferences
+
Current Time
+
Trip Context
```

---

# 4.5 Day-Wise Activity Planning

Users should be able to ask:

```text
I only have $40 today. Plan my day.
```

The chatbot can create:

```text
Morning
Free cultural attraction

Afternoon
Local market

Evening
Scenic walk

Dinner
Affordable local restaurant

Estimated Total
$35–$40
```

The platform should support:

* Budget travel
* Luxury travel
* Backpacking
* Family travel
* Solo travel
* Couple travel
* Group travel

---

# 4.6 Weather-Aware Recommendations

Weather should influence recommendations automatically.

### Example

```text
User:
What can I do today?

Context:
- Heavy rain
- Current location: Kyoto
- User has 6 hours available
```

WANDR:

```text
Since it is raining today, I would avoid outdoor attractions.

Suggested plan:

1. Kyoto Railway Museum
2. Nishiki Market
3. Traditional tea experience
4. Indoor dinner experience
```

The weather system should consider:

* Rain
* Temperature
* Extreme heat
* Snow
* Wind
* Storm warnings

---

# 4.7 Live Travel Q&A

During travel, the chatbot acts as a real-time assistant.

Example questions:

```text
I missed my train. What should I do?

Is this restaurant open now?

How do I get to the airport?

What does this local sign mean?

Where can I find a pharmacy?

Can I visit this place right now?
```

These queries should be answered with minimal latency.

---

# 5. Intelligent Query Routing

The system should classify every user query before responding.

## Query Types

```text
                    User Query
                        │
                        ▼
                Intent Classifier
                        │
       ┌────────────────┼────────────────┐
       │                │                │
       ▼                ▼                ▼
  Simple Chat      Recommendation      Live Data
       │                │                │
       ▼                ▼                ▼
  LLM Response     APIs / Tools      Live APIs
```

---

## Example Routing

### Query 1

```text
What are the best cafés near me?
```

Route:

```text
Vacay Chatbot
        ↓
Places API
        ↓
Personalization
        ↓
Response
```

---

### Query 2

```text
What should I do today?
```

Route:

```text
Vacay Chatbot
        ↓
Current Context
        ↓
Weather / Places APIs
        ↓
Recommendation Ranking
        ↓
Response
```

---

### Query 3

```text
I only have $40. Plan my day.
```

Route:

```text
Vacay Chatbot
        ↓
Budget Extraction
        ↓
Activity Search
        ↓
Restaurant Search
        ↓
Budget Optimization
        ↓
Day Plan
```

---

### Query 4

```text
Is it raining today?
```

Route:

```text
Weather Query
        ↓
Weather API
        ↓
Response
```

---

# 6. Conversation Architecture

## Lightweight Conversation Flow

The Vacay Chatbot should follow:

```text
User Message
     │
     ▼
Context Extraction
     │
     ▼
Intent Classification
     │
     ├── Simple Question
     │       ↓
     │   LLM Response
     │
     ├── Recommendation
     │       ↓
     │   API Search
     │       ↓
     │   Ranking
     │
     ├── Weather Query
     │       ↓
     │   Weather API
     │
     ├── Location Query
     │       ↓
     │   Maps / Places API
     │
     └── Transportation Query
             ↓
       Maps / Route API
```

The key principle is:

> **Do not use the full orchestration pipeline when a lightweight answer is sufficient.**

---

# 7. Personalization & User Memory

WANDR should gradually understand the traveller.

## User Preferences

Potential preferences:

```text
Travel Style:
- Backpacker
- Luxury
- Budget
- Slow Travel
- Adventure

Food:
- Vegetarian
- Vegan
- Halal
- Allergies
- Preferred cuisines

Activities:
- History
- Nature
- Shopping
- Nightlife
- Museums
- Food

Travel Pace:
- Relaxed
- Balanced
- Fast-paced
```

---

## Memory Types

### Long-Term Preferences

```text
User prefers cultural experiences.
```

---

### Trip-Specific Memory

```text
User is visiting Kyoto from July 10 to July 13.
```

---

### Session Memory

```text
User has already visited Fushimi Inari.
```

The system should avoid storing sensitive information unnecessarily.

---

# 8. Travel Context Model

Each conversation should maintain a structured travel context.

```json
{
  "destination": "Kyoto",
  "country": "Japan",
  "trip_dates": {
    "start": "2026-07-10",
    "end": "2026-07-13"
  },
  "travellers": {
    "type": "family",
    "count": 4
  },
  "budget": {
    "currency": "USD",
    "daily_limit": null
  },
  "preferences": [
    "culture",
    "food",
    "scenic places"
  ],
  "current_location": null,
  "weather_context": null,
  "visited_places": []
}
```

This context can be reused across the conversation.

---

# 9. Retrieval-Augmented Generation

The chatbot can use RAG for destination knowledge and contextual answers.

## Knowledge Pipeline

```text
Destination Knowledge
       │
       ▼
Data Collection
       │
       ▼
Validation
       │
       ▼
Chunking
       │
       ▼
Embeddings
       │
       ▼
Vector Database
       │
       ▼
Retrieval
       │
       ▼
LLM
       │
       ▼
Grounded Answer
```

---

## Knowledge Categories

```text
Destination Knowledge
├── Attractions
├── Activities
├── Restaurants
├── Local Experiences
├── Transportation
├── Neighbourhoods
└── Events
```

RAG should be used when the chatbot needs destination-specific knowledge that is not available through live APIs.

---

# 10. Source Freshness & Trust

Information retrieved from external sources should have metadata.

```json
{
  "source": "Destination Knowledge Source",
  "category": "Attraction",
  "last_updated": "2026-07-01",
  "retrieved_at": "2026-07-26",
  "confidence": "high"
}
```

For time-sensitive information:

```text
The information below was last verified on [date].
Availability and opening hours may change.
```

The chatbot should avoid presenting uncertain or outdated information as fact.

---

# 11. User Experience

## Main User Flow

```text
Open WANDR
    │
    ▼
Choose Destination
    │
    ▼
Start Conversation
    │
    ├── Ask a Travel Question
    │
    ├── Get Recommendations
    │
    ├── Plan Your Day
    │
    ├── Find Nearby Places
    │
    └── Get Real-Time Travel Help
```

---

# 12. Chat Experience

The chatbot should provide a conversational interface.

```text
┌─────────────────────────────────────┐
│             WANDR CHAT              │
├─────────────────────────────────────┤
│                                     │
│  I'm in Kyoto for two days.         │
│  What shouldn't I miss?             │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  For two days in Kyoto, I would     │
│  recommend...                       │
│                                     │
├─────────────────────────────────────┤
│ Ask WANDR anything...          🎤   │
└─────────────────────────────────────┘
```

The user should be able to continue naturally:

```text
User:
What about something less crowded?

WANDR:
If you want to avoid the busiest tourist spots, I would suggest...
```

---

# 13. Technical Architecture

## Proposed Stack

### Frontend

```text
React
Tailwind CSS
Map Integration
Responsive Web Application
```

### Backend

```text
FastAPI
Python
REST APIs
WebSocket Support
```

### AI Layer

```text
LLM
LangChain
RAG
Embeddings
Tool Calling
```

### Data Layer

```text
PostgreSQL
Redis
Vector Database
```

### External APIs

```text
Maps API
Places API
Weather API
Restaurant APIs
Transportation APIs
```

---

# 14. Backend Architecture

```text
                    ┌──────────────────┐
                    │     FRONTEND     │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    FASTAPI API   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   CHAT SERVICE   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   INTENT ROUTER  │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌────────────────┐   ┌────────────────┐
│ LLM Response  │   │ RAG Pipeline   │   │ Tool Layer     │
│               │   │                │   │                │
│ Simple Q&A    │   │ Destination    │   │ Maps           │
│ Conversation  │   │ Knowledge      │   │ Places         │
│               │   │                │   │ Weather        │
└───────────────┘   └────────────────┘   │ Restaurants    │
                                         │ Transportation │
                                         └───────┬────────┘
                                                 │
                                                 ▼
                                      ┌──────────────────┐
                                      │   DATA LAYER     │
                                      ├──────────────────┤
                                      │ PostgreSQL       │
                                      │ Redis            │
                                      │ Vector Database  │
                                      └──────────────────┘
```

---

# 15. API Design

## Chat Endpoint

```http
POST /api/chat
```

Request:

```json
{
  "message": "What should I do today?",
  "conversation_id": "conversation_123",
  "destination": "Kyoto",
  "current_location": {
    "latitude": 35.0116,
    "longitude": 135.7681
  }
}
```

Response:

```json
{
  "message": "Since it is raining today...",
  "intent": "recommendation",
  "sources": [
    "weather_api",
    "places_api"
  ]
}
```

---

## Destination Knowledge Endpoint

```http
GET /api/destinations/{destination}
```

Possible response:

```json
{
  "destination": "Kyoto",
  "attractions": {},
  "activities": {},
  "restaurants": {},
  "transportation": {},
  "events": {}
}
```

---

# 16. Intelligent Tool Selection

The LLM should have access to tools.

Example:

```text
get_weather()
search_places()
search_restaurants()
get_route()
get_nearby_attractions()
search_events()
```

The model should decide which tool is required.

Example:

```text
User:
Find a restaurant open after 10 PM near me.

LLM:
1. Detect current location
2. Extract restaurant intent
3. Extract time constraint
4. Call Places API
5. Filter open restaurants
6. Rank results
7. Respond
```

---

# 17. Recommendation Ranking

Recommendations should not simply be sorted by rating.

A recommendation score can consider:

```text
Recommendation Score =
User Preference Match
+
Distance
+
Rating
+
Opening Status
+
Budget Fit
+
Context Relevance
+
Weather Suitability
```

Example:

```text
Restaurant A:
High rating
Far away
Matches cuisine

Restaurant B:
Slightly lower rating
Very close
Matches cuisine
Within budget
Currently open

For this user:
Restaurant B may be the better recommendation.
```

---

# 18. Conversational UX Principles

WANDR should:

### Be Concise

Avoid overwhelming users with unnecessary information.

---

### Be Context-Aware

Do not ask questions that the system already knows.

---

### Be Honest

If information is uncertain:

```text
I couldn't verify this from a current source.
```

---

### Be Actionable

Instead of:

```text
The weather may be rainy.
```

Say:

```text
Rain is expected this afternoon, so I recommend visiting outdoor attractions in the morning and planning indoor activities after lunch.
```

---

### Be Conversational

The user should not have to formulate perfect queries.

The chatbot should understand:

```text
Where should I eat?

I'm tired. What can I do nearby?

I have 3 hours before my train.

Something cheap but nice.

What is worth seeing around here?
```

---

# 19. MVP Scope

## Phase 1 — Core Chatbot

### Features

* Destination-based conversations
* Basic recommendations
* Restaurant recommendations
* Nearby places
* Weather integration
* Basic user preferences
* Conversational memory

---

## Phase 2 — Intelligent Recommendations

### Features

* Budget-aware recommendations
* Travel companion-aware recommendations
* Weather-aware day planning
* Opening-hours filtering
* Distance-based ranking
* Personalized recommendation scoring

---

## Phase 3 — Real-Time Travel Assistant

### Features

* Live location-based suggestions
* Transportation assistance
* Route recommendations
* Event discovery
* Real-time availability
* Context-aware travel assistance

---

## Phase 4 — Advanced Conversational Intelligence

### Features

* Long-term preference memory
* Multi-destination conversations
* Advanced itinerary assistance
* Proactive recommendations
* Deeper personalization

---

# 20. Example End-to-End Experience

## Before the Trip

```text
User:
I am planning a 7-day trip to Japan.

WANDR:
I can help you plan it. Before we begin, what type of experience
are you looking for?

- Culture and history
- Food
- Nature
- Shopping
- A balanced trip
```

---

## During Planning

```text
User:
I want Tokyo and Kyoto.

WANDR:
That is possible in 7 days. I recommend:

Tokyo: 4 days
Kyoto: 3 days

Would you like me to optimize this for:
- Budget
- Comfort
- Maximum experiences?
```

---

## During the Trip

```text
User:
It is raining and I have 5 hours free.

WANDR:
I recommend:

1. Kyoto Railway Museum
2. Nishiki Market
3. Indoor cultural experience
4. Dinner near your current location

Would you like me to find options within your budget?
```

---

# 21. Key Differentiator

Most travel platforms focus on:

```text
Where to go
```

WANDR focuses on:

```text
Where to go
+
What to do
+
What fits you
+
What is possible right now
+
What is nearby
+
What fits your budget
+
What fits the weather
```

This creates a more personalized travel experience.

---

# 22. Product Positioning

## WANDR is not simply:

* A generic chatbot
* A search engine
* A maps application
* A travel blog
* A static itinerary planner

WANDR is:

> **A context-aware AI travel companion that understands natural conversation and combines personalization with real-time travel data to help users decide what to do next.**

---

# 23. Future Vision

The long-term vision is to create a globally intelligent conversational travel assistant.

A traveller should be able to ask:

```text
What should I do now?
```

And WANDR should understand:

```text
Who you are travelling with
+
Where you are
+
What you like
+
What you can afford
+
How much time you have
+
What the weather is doing
+
What you have already done
```

And use all of this information to answer:

> **"What should I do next?"**

---

# 24. Final Product Statement

WANDR's Vacay Chatbot is:

> **A conversational AI travel companion for recommendations, trip planning, and real-time travel assistance.**

It allows travellers to interact naturally instead of searching across multiple platforms.

From:

```text
"I'm in Kyoto for two days. What shouldn't I miss?"
```

to:

```text
"Find romantic restaurants near me."
```

to:

```text
"I only have $40 today. Plan my day."
```

to:

```text
"What can I do if it's raining today?"
```

WANDR understands the traveller's context and provides personalized, actionable recommendations.

> **Instead of making travellers search for answers, WANDR helps them simply ask.**
