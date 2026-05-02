import { Router, type IRouter } from "express";
import healthRouter from "./health";
import revenueRouter from "./revenue";

const router: IRouter = Router();

router.use(healthRouter);
router.use(revenueRouter);

export default router;
