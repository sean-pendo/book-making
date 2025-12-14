# Assignment Engine: Model Analysis & LP Theory

*A comprehensive deep dive into the Book Builder assignment engine - how it works, why the current hierarchical model has structural flaws, and when a pure weighted linear program would produce better results.*

*Estimated reading/listening time: 10-12 minutes*

---

## Introduction: What We're Solving

Before diving into the model, let's establish what Book Builder actually does.

Book Builder is a territory assignment tool for sales operations. The core problem it solves is: given a set of accounts and a set of sales reps, figure out who owns what.

This sounds simple, but it's actually a complex optimization problem with multiple competing objectives.

**Balance**: We want each rep to have roughly equal workload. If one rep has three million dollars in ARR and another has five hundred thousand, that's unfair. We measure balance across multiple dimensions - total ARR, number of accounts, CRE risk accounts, tier distribution, and quarterly renewal concentration.

**Continuity**: We want to minimize disruption. If an account has been with a rep for years, the rep knows the stakeholders, understands the business, and has relationships. Changing owners is disruptive to both the customer and the sales motion.

**Geography**: We want accounts to match their rep's region. A customer headquartered in Germany should probably be owned by someone on the EMEA team, not someone in the American West region.

**Team Alignment**: We want account complexity to match rep capability. Enterprise accounts with two thousand plus employees should go to enterprise reps. SMB accounts should go to SMB reps.

These objectives often conflict. The perfectly balanced assignment might break every continuity relationship. The perfect continuity assignment might leave some reps massively overloaded. The challenge is finding the right trade-offs.

---

## Part 1: The Data Model

Let me walk through what data we're working with.

**Accounts** are the things being assigned. Each account has:
- A unique Salesforce ID
- ARR - annual recurring revenue for customers
- ATR - available to renew, meaning renewal timing and value
- Geography - the sales territory and region
- Customer vs Prospect status
- Parent/child hierarchy - we only assign parent accounts, children follow
- CRE count - how many at-risk opportunities
- Expansion tier - Tier 1, Tier 2, or standard
- Current owner - who has this account today
- Owner change date and lifetime owner count - for continuity scoring

**Sales Reps** are the assignees. Each rep has:
- A unique rep ID
- Region - AMER sub-regions like Central, West, North East, South East
- Team tier - SMB, Growth, MM, or ENT
- Active status and assignment inclusion flags
- Strategic rep flag - for handling special accounts separately
- Backfill flags - for reps leaving or replacing someone

**Assignment Configuration** controls the optimization. It includes:
- Target ARR per rep
- Maximum ARR per rep (hard cap)
- Capacity variance percentage - how much over target is acceptable
- CRE limits per rep
- Tier concentration limits
- Quarterly renewal concentration limits
- Priority configuration - which priorities are enabled and in what order

---

## Part 2: The Current Architecture

The current system has two assignment engines, which is already a red flag. Let me describe the main one - the Waterfall Assignment Engine in simplified assignment engine dot ts.

The engine uses a **cascading priority waterfall**. Think of it as a series of filters that accounts pass through.

**Priority Zero: Manual Holdover**
Strategic accounts - those currently owned by strategic reps - get handled first. They stay with strategic reps, distributed evenly. Locked accounts also stay put. This priority runs before any optimization.

**Priority One: Continuity Plus Geography**
For each remaining account, we check: is the current owner in the same geography? Do they have capacity? If yes to both, the account stays. This is the ideal scenario - we preserve the relationship AND the geography match.

**Priority Two: Geography Match**
Accounts that couldn't stay with their owner get considered here. We find any rep in the matching geography who has capacity and optimize across them.

**Priority Three: Continuity Only**
Accounts that couldn't find a geographic match get considered here. If the current owner has capacity, even in a different region, the account can stay. This preserves relationships at the cost of geography.

**Priority Four: Fallback / Balance**
Accounts that couldn't match any of the above get assigned to whoever has capacity. This is pure load balancing.

**Residual Optimization: Force Assignment**
Any accounts still unassigned get force-assigned to the least loaded rep, even if it means exceeding capacity thresholds.

At each priority level, we're running HiGHS, a linear programming solver. The solver optimizes assignments within that priority level before accounts cascade to the next.

---

## Part 3: How HiGHS Works Within Each Priority

Let me explain what the solver actually does at each priority level.

The solver receives a set of accounts and a set of eligible reps for that priority. It needs to decide which accounts go to which reps.

**Decision Variables**: For each account-rep pair, we create a binary variable. Variable x underscore account underscore rep equals one means that account is assigned to that rep. Equals zero means it's not.

**Assignment Constraint**: Each account can go to at most one rep. This is a constraint that says the sum of all decision variables for a given account must be less than or equal to one.

**Capacity Constraint**: Each rep has an ARR limit. The sum of all account ARRs assigned to that rep must stay within capacity.

**Objective Function**: This is where we define what "good" means. For each potential assignment, we calculate a coefficient. Higher coefficient means more desirable.

The coefficient currently combines:
- Balance bonus - how much capacity does this rep have left?
- Continuity bonus - is this the current owner?
- Geography bonus - how well does the region match?
- Team alignment penalty - does the account tier match the rep tier?

The solver maximizes the sum of coefficients across all assignments. It finds the assignment that makes the total as high as possible while respecting constraints.

---

## Part 4: The Cascade Myopia Problem

Here's the fundamental issue. Each priority level runs its own optimization. The solver at Priority One doesn't know what will happen at Priority Two, Three, or Four. It's making locally optimal decisions without global visibility.

Let me give you a concrete example.

Imagine two accounts and one rep.

Account Alpha is small - fifty thousand dollars ARR. It was assigned to Rep Xavier two months ago. Not much relationship history.

Account Beta is large - two million dollars ARR. It's been with Rep Xavier for five years. Deep relationship. Critical account.

Rep Xavier is at ninety-five percent capacity. He can only take one more account.

The Priority One solver runs. It processes accounts in some order - let's say alphabetically. Account Alpha comes first. Same owner? Yes, Xavier. Same geography? Yes. Has capacity? Yes, barely. The solver assigns Alpha to Xavier. Xavier is now at one hundred percent.

Now Account Beta gets processed. Same owner? Yes, Xavier. Same geography? Yes. Has capacity? No - Xavier just hit his limit when we assigned Alpha.

Beta cascades to Priority Two. Maybe there's another rep in the geography with capacity - Beta gets assigned there. Or maybe not, and Beta cascades all the way to Priority Four and gets force-assigned to someone random.

**We just preserved continuity for a fifty thousand dollar account with a two-month relationship while breaking a five-year relationship on a two million dollar account.**

The solver couldn't see that it was making a bad trade. At Priority One, both accounts looked equally viable. The solver didn't know that preserving Alpha's continuity would cost us Beta's.

This is cascade myopia. The model is blind to downstream consequences.

A global optimizer would see both accounts simultaneously. It would recognize that Beta's continuity is more valuable than Alpha's. It would assign Beta to Xavier and let Alpha cascade - the opposite of what happened.

---

## Part 5: The Binary Eligibility Problem

The current model treats capacity as a binary gate. You're either eligible or you're not.

Rep at ninety-nine percent capacity? Eligible. Rep at one hundred point one percent? Not eligible.

This creates cliff effects that produce weird outcomes.

Imagine a rep is at ninety-nine point nine percent capacity. An account comes through that would push them to one hundred point five percent. Under current logic, that rep is "not eligible." The account cascades to the fallback pool and gets assigned to someone who might be a terrible match.

Meanwhile, another rep at ninety-nine percent gets an account that pushes them to exactly one hundred percent. They were "eligible" so they got it, even though the match quality was poor.

A zero point one percent capacity difference completely changed the outcome.

In proper LP formulation, you handle this with soft constraints. Instead of a binary "eligible or not," you add a penalty term to the objective function.

The penalty is proportional to how much you exceed the target. Going five percent over might cost you fifty points in the objective. Going twenty percent over might cost two hundred points.

The solver can then make trade-offs. Maybe it's worth paying a fifty-point penalty on one rep to avoid a five-hundred-point quality loss on another rep's assignments. The math works out globally.

With binary eligibility, you can't make these trades. The rep is either in the pool or out.

---

## Part 6: The Objective Function Problem

Let me break down exactly what's happening in the current objective function.

When we evaluate whether Account A should go to Rep B, we calculate a coefficient. This coefficient combines multiple factors, but here's the issue - they're not on the same scale.

**Balance Bonus**: We calculate how loaded the rep is relative to target. If they're at zero percent, the bonus is one hundred. If they're at two hundred percent, the bonus is zero. This ranges from zero to one hundred.

**Continuity Bonus**: If this is the account's current owner, we add thirty points. If not, we add zero. This is binary - thirty or zero.

**Geography Score**: We calculate a match quality score. Exact region match is one hundred. Sibling region is sixty. Parent region is forty. Global fallback is twenty-five. Then we multiply by a weight, usually around zero point three. So the actual contribution ranges from about seven to thirty.

**Team Alignment Penalty**: If the account tier doesn't match the rep tier, we subtract points. One-level mismatch subtracts ten. Two-plus level mismatch subtracts one hundred. This ranges from zero to one hundred, but negative.

We add these together: balance bonus plus continuity bonus plus geo bonus minus team penalty.

Can you see the problem? These scales are completely arbitrary.

Why is continuity worth thirty points? Compared to what baseline? Why is balance worth up to one hundred but continuity only thirty? Why is a team mismatch worth negative one hundred, which can completely overwhelm everything else?

These numbers were tuned by trial and error. Someone ran the engine, looked at results, said "continuity isn't respected enough," bumped the bonus from twenty to thirty, and moved on.

That's not principled optimization. That's fiddling with knobs until it looks okay.

In a proper weighted formulation, every component score is normalized to zero through one. Then you apply explicit weights that sum to one.

Balance weight zero point four. Continuity weight zero point three. Geography weight zero point two. Team alignment weight zero point one.

Now the relative importance is explicit. RevOps can see and configure it. "We care about balance forty percent." That's meaningful. "Continuity gets thirty points" is not meaningful without knowing the context.

---

## Part 7: The Meaningless Continuity Problem

You specifically flagged this concern - we need to make sure meaningless continuity isn't being preserved at the expense of meaningful outcomes.

Currently, the model gives a flat thirty-point bonus for any continuity. Account was with this rep? Plus thirty. That's it.

But continuity value varies enormously.

An account that's been with a rep for five years? That rep knows every stakeholder. They understand the company's strategy, their pain points, their internal politics. They've been through renewals together. Breaking that relationship would hurt the customer and hurt our renewal probability.

An account that was assigned two months ago? The rep might have had one intro call. There's no real relationship yet. Breaking this "continuity" costs nothing.

An account whose rep is marked as a backfill source - meaning they're leaving the company? That continuity is already broken. The rep is gone in a month. Preserving it makes zero sense.

An account that's had six different owners in the last two years? This account has never had stable ownership. The "current" owner is just whoever happens to be there now. There's no relationship to preserve.

The model can't tell these apart. They all get the same flat thirty points.

A smarter continuity score would consider:

**Tenure**: How long has the account been with this rep? We have owner change date. An account with the same owner for three years scores higher than one assigned last quarter.

**Stability**: How many owners has the account had historically? We have owners lifetime count. An account that's been passed around scores lower - there's less to preserve.

**Value**: Is this a large, strategic account where relationships really matter? A two-million-dollar enterprise account should weight continuity higher than a fifty-thousand-dollar SMB account.

**Rep Status**: Is the rep staying or leaving? If they're a backfill source, continuity score should be zero.

**Match Quality**: Does the account tier match the rep tier? If a Growth account is currently with an SMB rep, maybe that's not a relationship worth preserving.

With these factors, the LP could make intelligent trades. High-value continuity - five-year relationship, two-million-dollar account, rep is staying - gets a score of ninety. Low-value continuity - two-month relationship, small account, rep is leaving - gets a score of five.

The solver can then break the low-value continuity to preserve the high-value continuity. That's the right trade-off.

---

## Part 8: What a Single-Layer Weighted LP Looks Like

Let me describe the alternative architecture.

Instead of cascading priorities with separate solver runs, we have one solver run that sees everything.

**Decision Variables**: Same as before. Binary variables for each account-rep pair.

**Assignment Constraint**: Each account goes to exactly one rep. Not "at most one" - exactly one. We're guaranteeing full assignment.

**Capacity Constraints**: Each rep has a hard cap they cannot exceed. This is a real constraint. But the target becomes a soft constraint embedded in the objective.

**Objective Function**: For each potential assignment, we calculate a weighted score.

Score equals:
Weight balance times balance score, plus
Weight continuity times continuity score, plus
Weight geography times geography score, plus
Weight team times team alignment score, minus
Weight capacity penalty times capacity overage penalty.

Every score is normalized to zero through one. The weights are user-configurable and sum to one.

Balance score: One minus the ratio of current load to target. A rep at zero percent load scores one. A rep at target scores zero point five. A rep at double target scores zero.

Continuity score: The tenure, stability, value, and rep status factors I described, combined into zero through one.

Geography score: Exact match is one. Sibling region is zero point six. Parent region is zero point four. Different macro-region is zero point two.

Team alignment score: Exact tier match is one. One-level mismatch is zero point six. Two-plus level mismatch is zero point two.

Capacity penalty: If assignment would exceed target, the penalty grows quadratically. Five percent over costs a little. Twenty percent over costs a lot.

**The solver sees everything at once.** It knows that assigning Account A to Rep X will reduce capacity for Account B. It knows that breaking continuity here enables better geography there. It finds the globally optimal trade-off.

---

## Part 9: Comparing the Two Approaches

Let's be fair to both models.

**Hierarchical Model Advantages**

Explainability. When a manager asks "why did this account move?", you can say "Priority Two: Geography Match. Their current rep had no capacity, so we found someone in the same region." That's intuitive. It matches how humans think about the problem.

Debugging. You can trace an account through the cascade. "It failed P1 because geography didn't match. It failed P2 because no reps in region had capacity. It matched P3 because current owner could take it cross-geo." Clear audit trail.

Business alignment. The priority order reflects business heuristics. "Try to keep accounts with their owners first. If that fails, at least match geography. If that fails, preserve the relationship across regions. If that fails, just balance."

Configurability. RevOps can toggle priorities on and off. They can reorder them. They can adjust thresholds per priority. Business users understand it.

**Hierarchical Model Disadvantages**

Cascade myopia. Each priority is locally optimal but globally suboptimal. High-value accounts can get bad outcomes because low-value accounts consumed capacity first.

Cliff effects. Binary eligibility creates arbitrary outcome differences based on tiny capacity variations.

No trade-offs between priorities. The model can't break continuity at P1 to enable better geography at P2. Once P1 assigns something, it's done.

Objective function soup. The scoring within each priority isn't principled. Arbitrary scales and tuning.

**Weighted LP Advantages**

Global optimality. One solver sees everything. No cascading, no myopia. The best overall assignment, not the best-per-stage assignment.

Principled trade-offs. Weights are explicit. The relative importance of balance versus continuity versus geography is visible and configurable.

Soft constraints. Capacity isn't binary. The solver can exceed target a little if the quality improvement is worth it.

Multi-dimensional balance. You can optimize for ARR balance AND CRE balance AND tier balance simultaneously, with weights controlling relative importance.

Account-specific logic. Enterprise accounts could weight continuity higher. SMB could weight geography higher. The weights can vary per segment.

**Weighted LP Disadvantages**

Less intuitive. "Why did this account move?" The answer is "the solver determined that the weighted sum of balance, continuity, geography, and team alignment was higher for this rep than any other option, accounting for capacity penalties." Not as simple.

Harder to debug. No cascade to trace. The solver just produces a result. Understanding why requires examining objective coefficients and constraint slack.

Weight tuning complexity. Users need to understand what weights mean. Getting the weights right requires experimentation or data-driven calibration.

---

## Part 10: The Two-Model Recommendation

My recommendation is to build both and let users choose.

**The hierarchical model stays as primary.** It's what RevOps uses day to day for routine assignments. It produces explainable, auditable results. Managers can review assignments and understand the logic.

**The weighted LP becomes the secondary optimizer.** It's available when the primary produces poor outcomes - high unassigned rate, bad balance variance, lots of broken continuity on high-value accounts.

The system could even compare results automatically. "The hierarchical model produced fifteen percent balance variance and broke twelve high-value continuity relationships. The weighted LP achieves eight percent variance and only breaks three. Would you like to use the optimized result?"

Power users could access the weighted LP directly. They could experiment with weight configurations. "What if we cared about geography twice as much? What if we completely deprioritized continuity?" Run scenarios, see outcomes, make informed decisions.

---

## Part 11: Immediate Improvements to the Current Model

Even without building the secondary model, we can fix the current one.

**Fix continuity scoring.** Replace the flat thirty with value-based scoring. Use tenure, stability, value, and rep status. This alone would prevent low-value continuity from consuming capacity that high-value continuity needs.

**Normalize objective components.** Put balance, continuity, geography, and team alignment all on zero-to-one scales. Apply explicit weights. Make the relative importance visible and configurable.

**Add soft capacity to HiGHS.** Within each priority, instead of binary eligibility, add a penalty term for exceeding target. The solver within that priority can make small capacity trade-offs.

**Process accounts by value.** Instead of arbitrary ordering, process high-ARR accounts first. This ensures that if someone has to cascade to P4, it's a small account, not a critical one.

**Add continuity-tier interaction.** If an account's tier doesn't match its current owner's tier, reduce the continuity bonus. We shouldn't preserve a bad match just because it's the current match.

---

## Part 12: Implementation Considerations

A few technical notes for whoever builds this.

**Solver Performance**: HiGHS can handle problems with thousands of accounts and hundreds of reps. The constraint matrix gets large - number of accounts times number of reps decision variables - but modern LP solvers handle this fine. Typical solve times are under ten seconds.

**Normalization Matters**: When normalizing scores to zero-one, be careful about the scaling. ARR values might range from zero to ten million. You need consistent normalization across the dataset, not per-account normalization.

**Weight Calibration**: Start with equal weights and observe outcomes. Then adjust based on business feedback. "We're breaking too much continuity" means increase continuity weight. "Balance is too uneven" means increase balance weight.

**Constraint Feasibility**: Make sure the hard constraints are always satisfiable. If total account ARR exceeds total rep capacity, no solution exists. The solver will fail. Add slack variables or force-assignment fallbacks.

**Solution Stability**: Small changes to input data shouldn't cause large changes to output. If one account's ARR changes by one percent, we shouldn't see fifty accounts change owners. This is a concern with LP - optimal solutions can be at vertices that jump discontinuously. Consider adding regularization terms that penalize deviation from a baseline assignment.

---

## Closing Thoughts

The current model follows a reasonable intuition: try the best thing first, fall back gracefully. That's how humans think about complex problems.

But linear programming is powerful precisely because it doesn't think like humans. It considers thousands of options simultaneously. It evaluates global trade-offs. It finds solutions that humans would never spot through sequential reasoning.

The hierarchical model is greedy and local. Each stage makes the best decision it can see, without visibility into downstream consequences.

The weighted LP is global and principled. It sees everything at once and finds the mathematically optimal balance of competing objectives.

Both have value. The hierarchical model wins on explainability and intuition. The weighted LP wins on outcome quality and flexibility.

The best system offers both. Use the hierarchical model for routine operations where explainability matters. Use the weighted LP for challenging cases where outcome quality matters most. Let users see both and choose.

Territory assignment is a hard problem. Good tools give users power to solve it their way.

---

*Document created: December 2024*
*Related files: simplifiedAssignmentEngine.ts, rebalancingAssignmentService.ts, priorityRegistry.ts*
*Author: AI Analysis of Book Builder Codebase*
