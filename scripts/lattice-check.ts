// Which anchor counts the density slider lands on, and how even they are.
import {
  chooseCount,
  latticeShapes,
  pickLattice,
} from "../src/lib/layout/pointLattice";
import { anchorCountForDensity } from "../src/lib/layout/generateLayout";
import { mulberry32 } from "../src/lib/layout/rng";
const W = 3600,
  H = 3600;
for (const d of [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
  const t = anchorCountForDensity(d);
  const n = chooseCount(t, W, H);
  const s = pickLattice(n, W, H, mulberry32(1));
  console.log(
    `d=${d} target=${t} -> N=${n} quality=${s.quality.toFixed(2)} spacing=${s.lambda.toFixed(0)} t1=(${s.t1.x.toFixed(0)},${s.t1.y.toFixed(0)}) t2=(${s.t2.x.toFixed(0)},${s.t2.y.toFixed(0)}) options=${latticeShapes(n, W, H).filter((x) => x.lambda >= s.lambda * 0.97).length}`,
  );
}
