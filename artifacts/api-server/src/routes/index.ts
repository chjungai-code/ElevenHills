import { Router, type IRouter } from "express";
import healthRouter from "./health";
import revenueRouter from "./revenue";
import syncRouter from "./sync";
import metricsRouter from "./metrics";
import financialStatementsRouter from "./financial-statements";
import companiesRouter from "./companies";
import taxDocumentsRouter from "./tax-documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(revenueRouter);
router.use(syncRouter);
router.use(metricsRouter);
router.use(financialStatementsRouter);
router.use(companiesRouter);
router.use(taxDocumentsRouter);

export default router;
