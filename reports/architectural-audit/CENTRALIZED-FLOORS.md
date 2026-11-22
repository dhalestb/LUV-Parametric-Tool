# Floor-level Centralized evaluation

`centralized-floor-v3.0.0` groups regions by reviewed architectural storey before constructing the movement graph. Broad supported platforms seed floor elevations. Platforms seven feet apart can seed separate floors. Reviewers can assign regions to the same floor or create an additional floor by editing the architectural floor elevation. Small elevation differences alone do not establish a separate storey.

For each candidate, gathering suitability retains the calibrated geometric mean of area, clear width and headroom. Convergence counts independent branches of the confirmed same-floor graph. Accessibility divides the area of reachable occupied origins by the total area of other occupied origins on that floor. Unknown routes and unclassified same-floor regions can leave a result pending. With no other occupied origin, the accessibility fraction is undefined. A confirmed interlevel connection is retained in the source annotations and excluded from this graph.

Each floor ranks its qualifying destinations by 40% suitability, 40% convergence and 20% accessibility. Equal scores use ascending region ID for stable display. The primary is the first ranked destination. Other qualifying destinations are secondary. Each scored floor contributes its primary score once to the arithmetic mean. A reviewed floor without a qualifying destination is disclosed and excluded from the mean. An unfinished floor keeps the final building score pending while finished floor results remain visible. Adding an identical floor or a lower-ranked candidate earns no extra points.

For Linear, R10 and R3 are provisional candidates on different floors. The calibrated gathering terms are 40.0/40 and 36.7/40. R3 uses the conservative sampled minimum headroom of 5.41 ft within the measured footprint. Its localized obstruction is documented in the source review. The exterior loft is open to the sky; its area is separate from the reported covered-gallery measurement. Neither level requires a stair to the other. Neither has a fully reviewed same-level origin and approach inventory.

The archived graph and whole-building evaluations retain their methodology versions. Legacy spatial annotations can be copied into the new review and require floor-level confirmation before scoring. The other four descriptors keep their existing scoring and evidence.

See [original-model results](floor-results.json) for candidate measurements and outstanding evidence on each floor.
