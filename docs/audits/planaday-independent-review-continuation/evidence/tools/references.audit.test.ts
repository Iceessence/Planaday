import { expect, it } from 'vitest';
import {
  evaluateMathExpression as evalMath, findNumericalRoots, numericalDerivative, numericalIntegral, factorial,
  complexOp, matrixDeterminant, calcDilutionV1, calcPercentRecovery, calcRsdStats, formatSigFigs,
  toEngineeringNotation, convertUnitValue, UNIT_CATEGORIES,
} from '../src/core/mathEngine';
import { evaluateWorkbook, type WorksheetDef } from '../src/core/spreadsheetEngine';
import { computeWetNirComparison, type WetNirPairRecord } from '../src/core/labStats';

const mathChecks: Array<[string, number]> = [
  ['2+3*4',14],['(2+3)*4',20],['-2^2',-4],['2^3^2',512],['3/8+1/8',0.5],['2pi',2*Math.PI],
  ['sin(pi/6)',0.5],['cos(pi)',-1],['tan(pi/4)',1],['asin(1)',Math.PI/2],['acos(0)',Math.PI/2],
  ['atan(1)',Math.PI/4],['atan2(1,-1)',3*Math.PI/4],['sinh(0)',0],['cosh(0)',1],['tanh(0)',0],
  ['asinh(0)',0],['acosh(1)',0],['atanh(0)',0],['sqrt(81)',9],['cbrt(-27)',-3],
  ['abs(-7)',7],['ln(e)',1],['log(100)',2],['log10(1000)',3],['log2(1024)',10],['exp(0)',1],
  ['pow(2,8)',256],['floor(-1.2)',-2],['ceil(-1.2)',-1],['round(1.23456,3)',1.235],
  ['min(2,5,-3)',-3],['max(2,5,-3)',5],['mean(2,4,9)',5],['avg(2,4,9)',5],['sum(2,4,9)',15],
  ['fact(5)',120],['factorial(4)',24],['npr(5,2)',20],['ncr(5,2)',10],['sign(-9)',-1],['5!',120],
  ['3e-8+2e-8',5e-8],['1e150/1e149',10],
];
mathChecks.forEach(([input,expected],i)=>it('MA-'+String(i+1).padStart(3,'0')+' '+input,()=>{
  expect(Math.abs((evalMath(input)-expected)/(Math.abs(expected)||1))).toBeLessThan(1e-10);
}));
it('MA-045 angle units',()=>{
  expect(evalMath('sin(30)',{angleUnit:'deg'})).toBeCloseTo(.5,10);
  expect(evalMath('sin(100)',{angleUnit:'grad'})).toBeCloseTo(1,10);
});
it('MA-046 variables and custom function',()=>{
  expect(evalMath('f(3)+a',{vars:{a:2},userFns:{f:{param:'x',expr:'x^2+1'}}})).toBe(12);
});
it('MA-047 invalid arithmetic shape and domains',()=>{
  expect(()=>evalMath('1+')).toThrow();
  expect(Number.isNaN(evalMath('sqrt(-1)'))).toBe(true);
  expect(Number.isFinite(evalMath('1/0'))).toBe(false);
});
it('MA-048 factorial fraction and known formatting',()=>{
  expect(factorial(.5)).toBeCloseTo(Math.sqrt(Math.PI)/2,10);
  expect(formatSigFigs(1.23456,4)).toBe('1.235');
  expect(toEngineeringNotation(.000016,3)).toBe('16.000×10^-6');
});
it('MA-049 derivative, smooth integral and discontinuous integral state',()=>{
  expect(numericalDerivative('x^3',2)).toBeCloseTo(12,6);
  expect(numericalIntegral('x^2',0,3)).toBeCloseTo(9,10);
  expect(Number.isFinite(numericalIntegral('1/x',0,3))).toBe(false);
});
it('MA-050 finite simple roots',()=>expect(findNumericalRoots('x^2-1',-2,2)).toEqual([-1,1]));
it('MA-051 excludes a pole',()=>expect(findNumericalRoots('1/(x-0.123)',-1,1)).toEqual([]));
it('MA-052 detects a tangent root',()=>expect(findNumericalRoots('(x-0.123)^2',-1,1)[0]).toBeCloseTo(.123,3));
it('MA-053 complex arithmetic sign and magnitude',()=>{
 const a={re:3,im:4},b={re:1,im:-2};
 expect(complexOp(a,b,'+')).toEqual({re:4,im:2});
 expect(complexOp(a,b,'-')).toEqual({re:2,im:6});
 expect(complexOp(a,b,'*')).toEqual({re:11,im:-2});
 expect(complexOp(a,b,'/')).toEqual({re:-1,im:2});
});
it('MA-054 determinants',()=>{
 expect(matrixDeterminant([[2,3],[4,5]])).toBe(-2);
 expect(matrixDeterminant([[1,2,3],[0,4,5],[1,0,6]])).toBe(22);
});
it('MA-055 dilution, recovery and sample RSD',()=>{
 expect(calcDilutionV1(200,20,100)).toBe(10);
 expect(calcPercentRecovery(11,2,10)).toBe(90);
 expect(calcRsdStats([9,10,11])).toMatchObject({n:3,mean:10,sd:1,rsdPct:10});
});
const units:Array<[string,string,string,number,number]>=[
 ['length','in','cm',12,30.48],['mass','lb','kg',1,.45359237],['volume','gal','L',1,3.785411784],
 ['temperature','C','F',-40,-40],['area','ha','m2',3,30000],['time','hr','s',2,7200],['speed','kph','mps',36,10],
 ['acceleration','g0','mps2',1,9.80665],['pressure','atm','Pa',1,101325],['energy','kWh','J',1,3600000],
 ['power','kW','W',2,2000],['force','kN','N',2,2000],['electrical','A','mA',1,1000],
 ['frequency','rpm','Hz',60,1],['data','bit','B',8,1],['dataRate','MBps','Mbps',1,8],
 ['density','g_cm3','kg_m3',2,2000],['concentration','g_L','mg_mL',4,4],['flow','L_s','L_min',1,60],
 ['angle','turn','deg',.25,90],['torque','inlb','Nm',12,1.35582],['fuel','mpg','l100km',23.521458,10],
 ['radiation','rem','mSv',1,10],
];
for(const [i,[cat,from,to,value,expected]] of units.entries())it('UN-'+String(i+1).padStart(3,'0')+' '+cat,()=>{
 expect(Math.abs((convertUnitValue(cat,from,to,value)-expected)/expected)).toBeLessThan(2e-6);
 expect(convertUnitValue(cat,to,from,convertUnitValue(cat,from,to,value))).toBeCloseTo(value,7);
});
it('UN-024 all declared unit transforms invert at representative positive values',()=>{
 for(const {units} of Object.values(UNIT_CATEGORIES))for(const unit of units)for(const x of [.125,7,100])
   expect(unit.fromBase(unit.toBase(x))).toBeCloseTo(x,7);
});
const sheet=(expr:string):WorksheetDef[]=>[
 {id:'main',name:'Main',rows:8,cols:5,namedRanges:{Values:'A1:A3'},cells:{
   A1:{raw:'2'},A2:{raw:'4'},A3:{raw:'6'}, B1:{raw:'corn'},B2:{raw:'soy'},B3:{raw:'corn'},E1:{raw:expr},
 }},
 {id:'other',name:'Other',rows:5,cols:5,cells:{A1:{raw:'9'}}},
];
const formulas:Array<[string,string|number]>=[
 ['=SUM(A1:A3)',12],['=AVERAGE(A1:A3)',4],['=AVG(A1:A3)',4],['=COUNT(A1:B3)',3],
 ['=COUNTA(A1:B3)',6],['=MIN(A1:A3)',2],['=MAX(A1:A3)',6],['=MEDIAN(A1:A3)',4],
 ['=STDEV(A1:A3)',2],['=STDEV_S(A1:A3)',2],['=COUNTIF(A1:A3,">3")',2],['=SUMIF(B1:B3,"corn",A1:A3)',8],
 ['=IF(A1<A2,"yes","no")','yes'],['=AND(A1>0,A2<5)','TRUE'],['=OR(A1>3,A2>3)','TRUE'],
 ['=XLOOKUP("soy",B1:B3,A1:A3,"missing")',4],['=XLOOKUP("rice",B1:B3,A1:A3,"missing")','missing'],
 ['=CONCAT("A",A1)','A2'],['=CONCATENATE("A","B")','AB'],['=UPPER("Hi")','HI'],['=LOWER("Hi")','hi'],
 ['=LEN("abc")',3],['=LEFT("abc",2)','ab'],['=RIGHT("abc",2)','bc'],['=PMT(0,10,100)',-10],
 ['=NPV(0.1,110,121)',200],['=SUM(Values)',12],['=Other!A1+A1',11],['=TODAY()',new Date().toISOString().slice(0,10)],
 ['=LEFT("abc",0)',''],['=RIGHT("abc",0)',''],['=SUM(A1:A3)+1',13],['=Missing!A1+1','#REF!'],
];
formulas.forEach(([formula,expected],i)=>it('SH-'+String(i+1).padStart(3,'0')+' '+formula,()=>{
 const actual=evaluateWorkbook(sheet(formula)).main.E1.value;
 if(typeof expected==='number')expect(actual).toBeCloseTo(expected,8);
 else expect(actual).toBe(expected);
}));
it('SH-034 invalid arithmetic reports a spreadsheet error',()=>{
 expect(evaluateWorkbook(sheet('=1/0')).main.E1).toHaveProperty('error');
});
it('SH-035 changed cells recalculate and alter aggregate',()=>{
 const w=sheet('=SUM(A1:A3)');
 expect(evaluateWorkbook(w).main.E1.value).toBe(12);
 w[0].cells.A2.raw='8';
 expect(evaluateWorkbook(w).main.E1.value).toBe(16);
});
it('SH-036 circular arithmetic signals an error',()=>{
 const w=sheet('=A1');
 w[0].cells.A1.raw='=E1';
 expect(evaluateWorkbook(w).main.E1.value).toMatch(/^#/);
});

const qc=(n:number,wet:number,nir:number,extra:Partial<WetNirPairRecord>={}):WetNirPairRecord=>({
 id:'pair'+n, date:'2026-11-24', sampleId:'Synthetic '+n, analyte:'Moisture', commodity:'Synthetic grain',
 wetResult:wet,nirResult:nir,unit:'%',...extra,
} as WetNirPairRecord);
it('LA-001 reference points produce independent bias, SEP, RMSE, regression, counts and exclusion',()=>{
 const out=computeWetNirComparison([qc(1,1,2),qc(2,2,4),qc(3,3,6),qc(4,9,8,{excluded:true})]);
 expect(out).toMatchObject({nIncluded:3,nExcluded:1,meanWet:2,meanNir:4,bias:2,sdDiff:1,slope:2,intercept:0,pearsonR:1,rSquared:1});
 expect(out.rmse).toBeCloseTo(Math.sqrt(14/3),10);
});
it('LA-002 replicate handling, units warning, missing data and zero baseline',()=>{
 const out=computeWetNirComparison([qc(1,2,4,{wetReplicates:[0,0],nirReplicates:[2,4]}),qc(2,2,4,{unit:'mg/L'}),qc(3,NaN,4)]);
 expect(out.mixedUnitsWarning).toBe(true);
 expect(out.nIncluded).toBe(2);
 expect(out.points[0]).toMatchObject({wetMean:0,nirMean:3,pctDiff:null});
});
