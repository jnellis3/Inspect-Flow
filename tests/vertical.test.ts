import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectFields} from '../lib/inspection/fields';
import {EMPTY_VEHICLE, INSPECTION_TYPES, mileage, projectDetails, projectTitle} from '../lib/inspection/types';

const base = {inspection:{date:'2026-10-03',type:'Pre-purchase'},company:{name:'Shop'},voice:{mode:'ai'}};

test('project fields: homes need an address, vehicles need a make and model',() => {
  // Older clients send no vertical: they are home inspections.
  const home = ProjectFields.parse({...base,property:{address:'1234 Oak Hollow Ln'}});
  assert.equal(home.vertical,'home');
  assert.deepEqual(home.vehicle,EMPTY_VEHICLE);
  assert.throws(() => ProjectFields.parse({...base,property:{address:''}}),/property address/);

  assert.throws(() => ProjectFields.parse({...base,vertical:'vehicle',vehicle:{make:'Porsche'}}),/make and model/);
  const car = ProjectFields.parse({...base,vertical:'vehicle',vehicle:{year:'2011',make:'Porsche',model:'911',vin:' wp0ab2a9xbs720000 '}});
  assert.equal(car.vehicle.vin,'WP0AB2A9XBS720000');
  assert.equal(car.property.address,'');
  assert.throws(() => ProjectFields.parse({...base,vertical:'vehicle',vehicle:{year:'11',make:'Porsche',model:'911'}}),/four-digit year/);
});

test('project titles and details read naturally for each vertical',() => {
  const property = {address:'1234 Oak Hollow Ln',city:'Cypress, TX',kind:''};
  assert.equal(projectTitle({vertical:'home',property,vehicle:EMPTY_VEHICLE}),'1234 Oak Hollow Ln');
  assert.deepEqual(projectDetails({vertical:'home',property,vehicle:EMPTY_VEHICLE}),['Cypress, TX']);

  const vehicle = {...EMPTY_VEHICLE,year:'2011',make:'Porsche',model:'911',trim:'Carrera S',mileage:'48,210',location:'Scottsdale, AZ'};
  const blank = {address:'',city:'',kind:''};
  assert.equal(projectTitle({vertical:'vehicle',property:blank,vehicle}),'2011 Porsche 911 Carrera S');
  assert.deepEqual(projectDetails({vertical:'vehicle',property:blank,vehicle}),['48,210 miles','Scottsdale, AZ']);

  assert.equal(mileage('77,000 km'),'77,000 km');
  assert.equal(mileage(''),'');
  assert.ok(INSPECTION_TYPES.vehicle.includes('Pre-purchase'));
});
