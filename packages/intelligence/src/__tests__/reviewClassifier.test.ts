import { describe, it, expect } from "vitest";
import { classifyReview, type ClassifiableReview } from "../reviewClassifier.js";

describe("review classifier", () => {
  describe("sentiment classification", () => {
    it("classifies 5-star with positive language as positive", () => {
      const review: ClassifiableReview = {
        rating: 5,
        title: "Love this app",
        body: "This is amazing and works great!",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("positive");
    });

    it("classifies 5-star with negative language as mixed", () => {
      const review: ClassifiableReview = {
        rating: 5,
        title: "Great despite flaws",
        body: "I love it but it's terrible in some ways",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("mixed");
    });

    it("classifies 4-star as positive by default", () => {
      const review: ClassifiableReview = {
        rating: 4,
        title: "Good app",
        body: "Works well",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("positive");
    });

    it("classifies 4-star with negative words as mixed", () => {
      const review: ClassifiableReview = {
        rating: 4,
        title: "Good but frustrating",
        body: "Generally works but very frustrating to use",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("mixed");
    });

    it("classifies 3-star without sentiment words as neutral", () => {
      const review: ClassifiableReview = {
        rating: 3,
        title: "Average",
        body: "It works but nothing special",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("neutral");
    });

    it("classifies 3-star with mixed sentiments as mixed", () => {
      const review: ClassifiableReview = {
        rating: 3,
        title: "Some good some bad",
        body: "Love the design but hate the bugs",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("mixed");
    });

    it("classifies 2-star as negative by default", () => {
      const review: ClassifiableReview = {
        rating: 2,
        title: "Disappointing",
        body: "This was awful and frustrating",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("negative");
    });

    it("classifies 2-star with positive words as mixed", () => {
      const review: ClassifiableReview = {
        rating: 2,
        title: "Good idea, poor execution",
        body: "I love the concept but it's broken",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("mixed");
    });

    it("classifies 1-star as negative", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Terrible",
        body: "This app is awful and useless",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("negative");
    });

    it("classifies 1-star with positive words as mixed", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Amazing concept ruined",
        body: "Excellent idea but the app is broken",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("mixed");
    });

    it("handles null title", () => {
      const review: ClassifiableReview = {
        rating: 5,
        title: null,
        body: "This app is excellent and I love it",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("positive");
    });

    it("ignores case in sentiment matching", () => {
      const review1: ClassifiableReview = {
        rating: 5,
        title: "LOVE THIS APP",
        body: "EXCELLENT",
      };
      const review2: ClassifiableReview = {
        rating: 5,
        title: "love this app",
        body: "excellent",
      };
      expect(classifyReview(review1).sentiment).toBe(
        classifyReview(review2).sentiment
      );
    });
  });

  describe("topic detection", () => {
    it("detects subscription pricing topic", () => {
      const review: ClassifiableReview = {
        rating: 2,
        title: null,
        body: "Too expensive and overpriced",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("Subscription Pricing");
    });

    it("detects app performance topic", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Crashes constantly",
        body: "The app keeps freezing and crashes on every use",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("App Performance");
    });

    it("detects customer support topic", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "No support",
        body: "I contacted support but never got a response",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("Customer Support");
    });

    it("detects account access topic", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Can't log in",
        body: "I'm locked out and can't access my account",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("Account Access");
    });

    it("detects payment issues topic", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: null,
        body: "I was double charged and can't get a refund",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("Payment Issues");
    });

    it("detects UI topic", () => {
      const review: ClassifiableReview = {
        rating: 2,
        title: "Confusing interface",
        body: "The UI is cluttered and hard to navigate",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("User Interface");
    });

    it("detects ads topic", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Too many ads",
        body: "There are so many ads popping up all the time",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("Ads & Interruptions");
    });

    it("detects multiple topics", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: null,
        body: "App crashes constantly and the ads are overwhelming",
      };
      const result = classifyReview(review);
      expect(result.topics).toContain("App Performance");
      expect(result.topics).toContain("Ads & Interruptions");
    });

    it("returns empty topics for neutral review without keywords", () => {
      const review: ClassifiableReview = {
        rating: 3,
        title: "Average",
        body: "It does what it's supposed to do",
      };
      const result = classifyReview(review);
      expect(result.topics).toEqual([]);
    });
  });

  describe("improvement areas", () => {
    it("detects feature functionality issue", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Feature broken",
        body: "The main feature doesn't work properly",
      };
      const result = classifyReview(review);
      expect(result.improvementAreas).toContain("Feature Functionality");
    });

    it("detects billing accuracy issue", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: null,
        body: "I was double charged for the subscription",
      };
      const result = classifyReview(review);
      expect(result.improvementAreas).toContain("Billing Accuracy");
    });

    it("detects app performance issue", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Too slow",
        body: "The app loads very slowly and sometimes crashes",
      };
      const result = classifyReview(review);
      expect(result.improvementAreas).toContain("App Performance");
    });

    it("detects cancellation process issue", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Can't cancel",
        body: "Very hard to cancel the subscription",
      };
      const result = classifyReview(review);
      expect(result.improvementAreas).toContain("Cancellation Process");
    });

    it("detects multiple improvement areas", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: null,
        body: "App keeps crashing and the cancellation process is impossible",
      };
      const result = classifyReview(review);
      expect(result.improvementAreas).toContain("App Performance");
      expect(result.improvementAreas).toContain("Cancellation Process");
    });

    it("returns empty improvement areas for positive review", () => {
      const review: ClassifiableReview = {
        rating: 5,
        title: "Excellent app",
        body: "I love this app and use it every day",
      };
      const result = classifyReview(review);
      expect(result.improvementAreas).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles empty body", () => {
      const review: ClassifiableReview = {
        rating: 4,
        title: "Good",
        body: "",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("positive");
    });

    it("handles fractional ratings", () => {
      const review: ClassifiableReview = {
        rating: 2.5,
        title: null,
        body: "It's okay",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBeDefined();
    });

    it("rounds ratings correctly", () => {
      const review4_4: ClassifiableReview = {
        rating: 4.4,
        title: null,
        body: "",
      };
      const review4_5: ClassifiableReview = {
        rating: 4.5,
        title: null,
        body: "",
      };
      const result4_4 = classifyReview(review4_4);
      const result4_5 = classifyReview(review4_5);
      expect(result4_4.sentiment).toBe("positive");
      expect(result4_5.sentiment).toBe("positive");
    });

    it("handles very high ratings", () => {
      const review: ClassifiableReview = {
        rating: 10,
        title: "Perfect",
        body: "Best app ever",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("positive");
    });

    it("handles zero rating", () => {
      const review: ClassifiableReview = {
        rating: 0,
        title: "Worst",
        body: "Terrible app",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBeDefined();
    });

    it("handles negative rating", () => {
      const review: ClassifiableReview = {
        rating: -1,
        title: "Disaster",
        body: "Awful",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBeDefined();
    });
  });

  describe("real-world examples", () => {
    it("handles real crash report", () => {
      const review: ClassifiableReview = {
        rating: 1,
        title: "Keeps crashing",
        body: "Every time I try to use this app it crashes and force closes. Very frustrating.",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("negative");
      expect(result.topics).toContain("App Performance");
    });

    it("handles subscription complaint", () => {
      const review: ClassifiableReview = {
        rating: 2,
        title: "Way too expensive",
        body: "Love the app but the subscription is way overpriced. Not worth the monthly cost.",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("mixed");
      expect(result.topics).toContain("Subscription Pricing");
    });

    it("handles positive review with minor issues", () => {
      const review: ClassifiableReview = {
        rating: 4,
        title: "Great app with minor bugs",
        body: "I love this app and use it daily. Would be perfect if they fixed the occasional lag.",
      };
      const result = classifyReview(review);
      expect(result.sentiment).toBe("positive");
    });
  });
});
