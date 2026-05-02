import { Router, type IRouter } from "express";
import healthRouter from "./health";
import revenueRouter from "./revenue";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(revenueRouter);
router.use(syncRouter);

export default router;
