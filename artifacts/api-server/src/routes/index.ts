import { Router, type IRouter } from "express";
import healthRouter from "./health";
import revenueRouter from "./revenue";
import syncRouter from "./sync";
import metricsRouter from "./metrics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(revenueRouter);
router.use(syncRouter);
router.use(metricsRouter);

export default router;
